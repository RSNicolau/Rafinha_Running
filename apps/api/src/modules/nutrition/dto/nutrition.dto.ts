import { IsString, IsOptional, IsInt, IsNumber, IsArray, Min, IsDateString } from 'class-validator';

export class CreateMealDto {
  @IsDateString()
  date: string;

  @IsString()
  mealName: string;

  @IsString()
  @IsOptional()
  mealTime?: string;

  @IsInt()
  @Min(0)
  calories: number;

  @IsNumber()
  @Min(0)
  protein: number;

  @IsNumber()
  @Min(0)
  carbs: number;

  @IsNumber()
  @Min(0)
  fat: number;

  @IsArray()
  @IsOptional()
  items?: string[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateWaterDto {
  @IsInt()
  @Min(0)
  amount: number;

  @IsInt()
  @Min(500)
  @IsOptional()
  goal?: number;

  @IsDateString()
  date: string;
}
