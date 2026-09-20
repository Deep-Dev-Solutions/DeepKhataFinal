import { IsNotEmpty, IsNumber, IsPositive, IsString } from 'class-validator';

export class RecordPaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'Order ID is required' })
  orderId: string;

  @IsNumber()
  @IsPositive({ message: 'Payment amount must be greater than zero' })
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'Payment method is required' })
  method: string;
}
