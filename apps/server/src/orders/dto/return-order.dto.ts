import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReturnOrderItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Product ID is required for return item' })
  productId: string;

  @IsInt()
  @Min(1, { message: 'Return quantity must be at least 1' })
  quantity: number;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsString()
  @IsOptional()
  returnCondition?: string;
}

export class ReturnOrderDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Must provide at least one item to return' })
  @ValidateNested({ each: true })
  @Type(() => ReturnOrderItemDto)
  itemsToReturn: ReturnOrderItemDto[];

  @IsString()
  @IsOptional()
  returnStatus?: string;
}
