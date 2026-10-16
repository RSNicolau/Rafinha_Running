import { IsString, IsOptional, IsInt, IsNumber, IsArray, Min, IsDateString, IsEnum, IsNotEmpty, MaxLength } from 'class-validator';

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

export class AnalyzeMacrosDto {
  @IsString() @IsNotEmpty({ message: 'Descrição obrigatória' }) @MaxLength(2000)
  description: string;
}

export class CreateSupplementDto {
  @IsString() @IsNotEmpty({ message: 'Nome do suplemento é obrigatório' }) @MaxLength(100)
  name: string;

  @IsOptional() @IsString() @MaxLength(100)
  dose?: string;

  @IsOptional() @IsString() @MaxLength(50)
  timeOfDay?: string;

  @IsOptional() @IsString() @MaxLength(20)
  color?: string;

  @IsOptional() @IsString() @MaxLength(20)
  icon?: string;
}

export class ToggleSupplementDto {
  @IsOptional() @IsDateString({}, { message: 'Data inválida' })
  date?: string;
}
