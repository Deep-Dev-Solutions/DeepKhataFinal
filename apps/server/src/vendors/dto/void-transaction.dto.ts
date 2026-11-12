import { IsString, Length } from 'class-validator';

export class VoidTransactionDto {
  @IsString()
  @Length(3, 200, {
    message: 'reason must be between 3 and 200 characters',
  })
  reason!: string;
}
