import { IsString, Length } from 'class-validator';

export class ThrowBottleDto {
  @IsString()
  @Length(1, 300)
  content!: string;
}
