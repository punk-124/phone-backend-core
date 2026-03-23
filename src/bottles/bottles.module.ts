import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DailyQuotaService } from '../common/daily-quota.service';
import { BottlesController } from './bottles.controller';
import { BottlesService } from './bottles.service';

@Module({
  imports: [AuthModule],
  controllers: [BottlesController],
  providers: [BottlesService, DailyQuotaService]
})
export class BottlesModule {}
