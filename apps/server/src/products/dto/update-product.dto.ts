import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Product name cannot be empty' })
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty({ message: 'SKU cannot be empty' })
  @MaxLength(64)
  @IsOptional()
  sku?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Price must be greater than zero' })
  @IsOptional()
  basePrice?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  defaultCostPrice?: number;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @MaxLength(64)
  @IsOptional()
  partNumber?: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  aliases?: string[];

  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @IsOptional()
  compatibleWith?: string[];

  // null clears the minimum price
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minSalePrice?: number | null;

  // null clears the threshold
  @ValidateIf((_o, v) => v !== undefined && v !== null)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number | null;
}
