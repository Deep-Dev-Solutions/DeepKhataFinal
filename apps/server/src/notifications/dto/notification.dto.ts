import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  registerDecorator,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CHANNELS,
  Channel,
  RULE_KEYS,
  RuleConfig,
  RuleKey,
  Recipients,
} from '../defaults';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Returns an error message or null when the partial rule config is valid. */
function checkRulePatch(key: string, patch: unknown): string | null {
  if (!isRecord(patch)) return `rules.${key} must be an object`;
  const allowed = ['enabled', 'channels', 'daysBefore', 'offsetsDays', 'time'];
  for (const k of Object.keys(patch)) {
    if (!allowed.includes(k)) return `rules.${key}.${k} is not allowed`;
  }
  if ('enabled' in patch && typeof patch.enabled !== 'boolean') {
    return `rules.${key}.enabled must be a boolean`;
  }
  if ('channels' in patch) {
    const c = patch.channels;
    if (
      !Array.isArray(c) ||
      c.length > CHANNELS.length ||
      !c.every((x) => typeof x === 'string' && CHANNELS.includes(x as Channel))
    ) {
      return `rules.${key}.channels must be a subset of ${CHANNELS.join(', ')}`;
    }
  }
  const isDay = (n: unknown) =>
    typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 365;
  if ('daysBefore' in patch && !isDay(patch.daysBefore)) {
    return `rules.${key}.daysBefore must be an integer between 1 and 365`;
  }
  if ('offsetsDays' in patch) {
    const o = patch.offsetsDays;
    if (!Array.isArray(o) || o.length > 20 || !o.every(isDay)) {
      return `rules.${key}.offsetsDays must be positive integers up to 365`;
    }
  }
  if (
    'time' in patch &&
    !(typeof patch.time === 'string' && TIME_RE.test(patch.time))
  ) {
    return `rules.${key}.time must be HH:mm`;
  }
  return null;
}

function IsRulesPatch() {
  return (target: object, propertyKey: string) => {
    registerDecorator({
      name: 'isRulesPatch',
      target: target.constructor,
      propertyName: propertyKey,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const msg = validateRules(value);
          (args.object as { __rulesError?: string }).__rulesError =
            msg ?? undefined;
          return msg === null;
        },
        defaultMessage(args: ValidationArguments) {
          return (
            (args.object as { __rulesError?: string }).__rulesError ??
            'rules is invalid'
          );
        },
      },
    });
  };
}

function validateRules(value: unknown): string | null {
  if (!isRecord(value)) return 'rules must be an object';
  for (const [key, patch] of Object.entries(value)) {
    if (!RULE_KEYS.includes(key as RuleKey)) {
      return `rules.${key} is not a known rule`;
    }
    const err = checkRulePatch(key, patch);
    if (err) return err;
  }
  return null;
}

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsObject()
  @IsRulesPatch()
  rules?: Partial<Record<RuleKey, Partial<RuleConfig>>>;

  @IsOptional()
  @IsString()
  @Matches(TIME_RE, { message: 'digestTime must be HH:mm' })
  digestTime?: string;

  @IsOptional()
  @IsIn(['OWNER_ONLY', 'OWNER_AND_MANAGERS'])
  recipients?: Recipients;
}

export class MarkReadDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
