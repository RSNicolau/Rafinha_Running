import { IsString, IsOptional, IsInt, IsNumber, IsArray, Min, IsDateString, IsEnum } from 'class-validator';

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

export class CreateNutritionLogDto {
  @IsString()
  @IsOptional()
  mealType?: string;

  @IsString()
  description: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  calories?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  carbs?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  protein?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  fat?: number;

  @IsString()
  @IsOptional()
  loggedAt?: string;
}

export class CreateWaterLogDto {
  @IsInt()
  @Min(0)
  amountMl: number;

  @IsString()
  @IsOptional()
  loggedAt?: string;
}
