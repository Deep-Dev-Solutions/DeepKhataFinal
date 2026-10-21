import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body for routes that take only an optional Turnstile token. */
export class CaptchaBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}
