import { IsNumber, IsPositive } from 'class-validator';

export class UpdatePriceDto {
  @IsNumber()
  @IsPositive({ message: 'Price must be greater than zero' })
  price: number;
}
