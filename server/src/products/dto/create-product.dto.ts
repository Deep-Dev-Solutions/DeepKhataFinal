import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
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
  rack?: string;

  @IsString()
  @IsOptional()
  shelf?: string;

  @IsString()
  @IsOptional()
  bin?: string;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsInt()
  @Min(1, { message: 'Initial quantity must be at least 1' })
  @IsOptional()
  quantity?: number;

  @IsString()
  @IsOptional()
  vendorId?: string;
}
