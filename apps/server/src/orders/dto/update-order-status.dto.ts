import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsString()
  @IsNotEmpty({ message: 'Status is required' })
  status: string;
}
