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
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Product name is required' })
  name: string;

  @IsNumber()
  @IsPositive({ message: 'Price must be greater than zero' })
  price: number;

  @IsString()
  @IsNotEmpty({ message: 'Category is required' })
  category: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  cabinetId?: string;

  @IsString()
  @IsOptional()
  branchId?: string;

  @IsNumber()
  @IsOptional()
  defaultCostPrice?: number;

  @IsString()
  @IsOptional()
  rack?: string;

  @IsString()
  @IsOptional()
  shelf?: string;

  @IsString()
  @IsOptional()
  bin?: string;

  @IsInt()
  @Min(1, { message: 'Initial quantity must be at least 1' })
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  vendorId?: string;

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

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  minSalePrice?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  lowStockThreshold?: number;
}
