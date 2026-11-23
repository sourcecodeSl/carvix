import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(1024)
  password!: string;
}

export class ActiveTenantDto {
  @ApiProperty({ example: '11111111-1111-4111-8111-111111111111' })
  @IsString()
  @MaxLength(36)
  tenantId!: string;
}
