import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsNotEmpty()
  code: string;
}
