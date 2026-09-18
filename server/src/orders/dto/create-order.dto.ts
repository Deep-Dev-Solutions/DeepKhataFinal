import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
  @IsString()
  @IsOptional()
  productId?: string;

  @IsInt()
  @Min(1, { message: 'Item quantity must be at least 1' })
  @Max(99999, { message: 'Item quantity exceeds maximum allowed limit' })
  quantity: number;

  @IsNumber()
  @Min(0, { message: 'Item price cannot be negative' })
  @IsOptional()
  price?: number;

  @IsBoolean()
  @IsOptional()
  isService?: boolean;

  @IsString()
  @IsOptional()
  serviceName?: string;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateOrderDto {
  @IsString()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  customerId?: string;

  @IsString()
  @IsOptional()
  walkInName?: string;

  @IsString()
  @IsOptional()
  walkInPhone?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Cart must contain at least one item' })
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsNumber()
  @Min(0, { message: 'Discount cannot be negative' })
  @IsOptional()
  discount?: number;

  @IsNumber()
  @Min(0, { message: 'Amount paid cannot be negative' })
  @IsOptional()
  amountPaid?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  orderStatus?: string;
}
