import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/auth-user.interface';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { ThrowBottleDto } from './dto/throw-bottle.dto';
import { Bottle, BottlePoolResponse, BottlesService, MineBottlesResponse } from './bottles.service';

@ApiTags('bottles')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('bottles')
export class BottlesController {
  constructor(private readonly bottlesService: BottlesService) {}

  @Post()
  @ApiOperation({ summary: 'Throw a bottle to the shared pool' })
  throwBottle(@CurrentUser() user: AuthUser, @Body() dto: ThrowBottleDto): Bottle {
    return this.bottlesService.throwBottle(user.sub, dto);
  }

  @Post('pick')
  @ApiOperation({ summary: 'Pick one random bottle from shared pool' })
  pickBottle(@CurrentUser() user: AuthUser): Bottle | null {
    return this.bottlesService.pickBottle(user.sub);
  }

  @Post(':id/pass')
  @ApiOperation({ summary: 'Pass current picked bottle and return it to pool' })
  passBottle(@CurrentUser() user: AuthUser, @Param('id') bottleId: string): Bottle {
    return this.bottlesService.passBottle(user.sub, bottleId);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Get my thrown/picked bottles' })
  mine(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto): MineBottlesResponse {
    return this.bottlesService.mine(user.sub, query);
  }

  @Get('pool')
  @ApiOperation({ summary: 'Debug endpoint: list current pool' })
  pool(@Query() query: PaginationQueryDto): BottlePoolResponse {
    return this.bottlesService.pool(query);
  }

  @Get('quota/usage')
  @ApiOperation({ summary: 'Check daily read/write usage' })
  quotaUsage() {
    return this.bottlesService.quotaUsage();
  }
}
