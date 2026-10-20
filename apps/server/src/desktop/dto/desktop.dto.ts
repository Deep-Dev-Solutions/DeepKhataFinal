import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class DesktopPushDto {
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  /**
   * Each event is validated one by one in DesktopPushService so one bad event
   * is rejected with a reason instead of failing the whole batch.
   */
  @IsArray()
  @ArrayMaxSize(500)
  events: unknown[];
}

export interface DesktopPushResult {
  accepted: string[];
  rejected: { id: string; reason: string }[];
}

