import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  Channel,
  CHANNELS,
  DEFAULT_RULES,
  RULE_KEYS,
  Recipients,
  RuleConfig,
  RuleKey,
} from './defaults';
import { EmailChannel } from './email.channel';
import { UpdateNotificationSettingsDto } from './dto/notification.dto';

export interface NotifyInput {
  businessId: string;
  userId?: string;
  branchId?: string | null;
  type: string;
  title: string;
  body: string;
  link?: string;
  entityType?: string;
  entityId?: string;
}

export interface EffectiveSettings {
  rules: Record<RuleKey, RuleConfig>;
  digestTime: string;
  recipients: Recipients;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function mergeRule(base: RuleConfig, patch: unknown): RuleConfig {
  const merged: RuleConfig = {
    ...base,
    channels: [...base.channels],
    ...(base.offsetsDays ? { offsetsDays: [...base.offsetsDays] } : {}),
  };
  if (!isRecord(patch)) return merged;
  if (typeof patch.enabled === 'boolean') merged.enabled = patch.enabled;
  if (Array.isArray(patch.channels)) {
    merged.channels = patch.channels.filter((c): c is Channel =>
      CHANNELS.includes(c as Channel),
    );
  }
  if (typeof patch.daysBefore === 'number') merged.daysBefore = patch.daysBefore;
  if (Array.isArray(patch.offsetsDays)) {
    merged.offsetsDays = patch.offsetsDays.filter(
      (n): n is number => typeof n === 'number',
    );
  }
  if (typeof patch.time === 'string') merged.time = patch.time;
  return merged;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailChannel,
  ) {}

  /**
   * Creates in-app notifications. With userId: one row for that user (skipped if
   * the user is not in the business). Otherwise fans out to OWNERs (+ MANAGERs
   * unless recipients is OWNER_ONLY). Returns rows created.
   */
  async notify(
    input: NotifyInput,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const db = tx ?? this.prisma;
    const settings = await this.getEffectiveSettings(input.businessId, tx);

    let recipientIds: string[];
    if (input.userId) {
      const user = await db.user.findFirst({
        where: { id: input.userId, businessId: input.businessId },
        select: { id: true },
      });
      recipientIds = user ? [user.id] : [];
    } else {
      const roles: ('OWNER' | 'MANAGER')[] =
        settings.recipients === 'OWNER_ONLY'
          ? ['OWNER']
          : ['OWNER', 'MANAGER'];
      const users = await db.user.findMany({
        where: { businessId: input.businessId, role: { in: roles } },
        select: { id: true },
      });
      recipientIds = users.map((u) => u.id);
    }
    if (recipientIds.length === 0) return 0;

    const result = await db.notification.createMany({
      data: recipientIds.map((userId) => ({
        businessId: input.businessId,
        userId,
        branchId: input.branchId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      })),
    });

    const rule = (RULE_KEYS as readonly string[]).includes(input.type)
      ? settings.rules[input.type as RuleKey]
      : undefined;
    if (rule?.enabled && rule.channels.includes('EMAIL')) {
      for (const userId of recipientIds) {
        await this.email.send({
          businessId: input.businessId,
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          link: input.link,
        });
      }
    }
    return result.count;
  }

  async getEffectiveSettings(
    businessId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<EffectiveSettings> {
    const db = tx ?? this.prisma;
    const row = await db.notificationSetting.findFirst({
      where: { businessId, userId: null },
    });
    const stored = row && isRecord(row.rules) ? row.rules : {};
    const rules = {} as Record<RuleKey, RuleConfig>;
    for (const key of RULE_KEYS) {
      rules[key] = mergeRule(DEFAULT_RULES[key], stored[key]);
    }
    return {
      rules,
      digestTime: row?.digestTime ?? '10:00',
      recipients:
        row?.recipients === 'OWNER_ONLY' ? 'OWNER_ONLY' : 'OWNER_AND_MANAGERS',
    };
  }

  async updateSettings(
    businessId: string,
    dto: UpdateNotificationSettingsDto,
  ): Promise<EffectiveSettings> {
    const existing = await this.prisma.notificationSetting.findFirst({
      where: { businessId, userId: null },
    });
    const storedRules = (
      existing && isRecord(existing.rules) ? existing.rules : {}
    ) as Record<string, unknown>;
    const nextRules: Record<string, unknown> = {};
    for (const key of RULE_KEYS) {
      const patch = dto.rules?.[key];
      const prior = storedRules[key];
      if (patch !== undefined || prior !== undefined) {
        nextRules[key] = {
          ...(isRecord(prior) ? prior : {}),
          ...patch,
        };
      }
    }
    const rulesJson = nextRules as Prisma.InputJsonValue;

    if (existing) {
      await this.prisma.notificationSetting.update({
        where: { id: existing.id },
        data: {
          rules: rulesJson,
          ...(dto.digestTime !== undefined && { digestTime: dto.digestTime }),
          ...(dto.recipients !== undefined && { recipients: dto.recipients }),
        },
      });
    } else {
      await this.prisma.notificationSetting.create({
        data: {
          businessId,
          userId: null,
          rules: rulesJson,
          ...(dto.digestTime !== undefined && { digestTime: dto.digestTime }),
          ...(dto.recipients !== undefined && { recipients: dto.recipients }),
        },
      });
    }
    return this.getEffectiveSettings(businessId);
  }

  async list(
    businessId: string,
    userId: string,
    limit: number,
    cursor?: string,
  ) {
    const rows = await this.prisma.notification.findMany({
      where: { businessId, userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const unreadCount = await this.prisma.notification.count({
      where: { businessId, userId, readAt: null },
    });
    return {
      items,
      unreadCount,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async markRead(
    businessId: string,
    userId: string,
    ids?: string[],
    all?: boolean,
  ): Promise<{ updated: number }> {
    if (!all && (!ids || ids.length === 0)) return { updated: 0 };
    const result = await this.prisma.notification.updateMany({
      where: {
        businessId,
        userId,
        readAt: null,
        ...(all ? {} : { id: { in: ids } }),
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  /** Dedupe guard for scheduled rules. Returns false when already logged. */
  async tryLog(
    businessId: string,
    ruleKey: string,
    entityId: string,
    fireDate: Date,
  ): Promise<boolean> {
    try {
      await this.prisma.notificationLog.create({
        data: { businessId, ruleKey, entityId, fireDate },
      });
      return true;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return false;
      }
      throw e;
    }
  }
}
