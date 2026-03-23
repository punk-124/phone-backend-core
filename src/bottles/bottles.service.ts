import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidV4 } from 'uuid';
import { DailyQuotaService } from '../common/daily-quota.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { ThrowBottleDto } from './dto/throw-bottle.dto';

export type BottleStatus = 'floating' | 'picked';

export interface Bottle {
  id: string;
  content: string;
  authorId: string;
  status: BottleStatus;
  createdAt: string;
  pickedBy?: string;
  pickedAt?: string;
}

export interface MineBottlesResponse {
  thrown: Bottle[];
  picked: Bottle[];
  pagination: {
    offset: number;
    limit: number;
    thrownTotal: number;
    pickedTotal: number;
  };
}

export interface BottlePoolResponse {
  rows: Bottle[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
  };
}

const ACTION_THROW = '\u6254\u74f6\u5b50';
const ACTION_PICK = '\u6361\u74f6\u5b50';
const ACTION_PASS = '\u7565\u8fc7\u74f6\u5b50';
const ACTION_VIEW_MINE = '\u67e5\u770b\u6211\u7684\u74f6\u5b50';
const ACTION_VIEW_POOL = '\u67e5\u770b\u74f6\u5b50\u6c60';

@Injectable()
export class BottlesService {
  private readonly bottles: Bottle[] = [];
  private readonly userPickedHistory = new Map<string, Set<string>>();
  private readonly defaultPickReadCost = 20;

  constructor(private readonly dailyQuotaService: DailyQuotaService) {}

  throwBottle(userId: string, dto: ThrowBottleDto): Bottle {
    this.dailyQuotaService.consumeWrite(1, ACTION_THROW);
    const bottle: Bottle = {
      id: uuidV4(),
      content: dto.content.trim(),
      authorId: userId,
      status: 'floating',
      createdAt: new Date().toISOString()
    };
    this.bottles.unshift(bottle);
    return bottle;
  }

  pickBottle(userId: string): Bottle | null {
    this.dailyQuotaService.consumeRead(this.defaultPickReadCost, ACTION_PICK);
    this.dailyQuotaService.consumeWrite(1, ACTION_PICK);
    const pickedSet = this.userPickedHistory.get(userId) ?? new Set<string>();

    const candidates = this.bottles.filter(
      (bottle) =>
        bottle.status === 'floating' && bottle.authorId !== userId && !pickedSet.has(bottle.id)
    );
    if (candidates.length === 0) {
      return null;
    }

    const bottle = candidates[Math.floor(Math.random() * candidates.length)];
    bottle.status = 'picked';
    bottle.pickedBy = userId;
    bottle.pickedAt = new Date().toISOString();

    pickedSet.add(bottle.id);
    this.userPickedHistory.set(userId, pickedSet);

    return bottle;
  }

  passBottle(userId: string, bottleId: string): Bottle {
    this.dailyQuotaService.consumeWrite(1, ACTION_PASS);
    const bottle = this.bottles.find((item) => item.id === bottleId);
    if (!bottle) {
      throw new NotFoundException('Bottle not found');
    }
    if (bottle.pickedBy === userId) {
      bottle.status = 'floating';
      bottle.pickedBy = undefined;
      bottle.pickedAt = undefined;
    }
    return bottle;
  }

  mine(userId: string, query: PaginationQueryDto): MineBottlesResponse {
    const thrown = this.bottles.filter((item) => item.authorId === userId);
    const picked = this.bottles.filter((item) => item.pickedBy === userId);
    const thrownPage = thrown.slice(query.offset, query.offset + query.limit);
    const pickedPage = picked.slice(query.offset, query.offset + query.limit);
    const readRows = Math.max(thrownPage.length + pickedPage.length, 1);
    this.dailyQuotaService.consumeRead(readRows, ACTION_VIEW_MINE);

    return {
      thrown: thrownPage,
      picked: pickedPage,
      pagination: {
        offset: query.offset,
        limit: query.limit,
        thrownTotal: thrown.length,
        pickedTotal: picked.length
      }
    };
  }

  pool(query: PaginationQueryDto): BottlePoolResponse {
    const total = this.bottles.length;
    const rows = this.bottles.slice(query.offset, query.offset + query.limit);
    this.dailyQuotaService.consumeRead(Math.max(rows.length, 1), ACTION_VIEW_POOL);

    return {
      rows,
      pagination: {
        offset: query.offset,
        limit: query.limit,
        total
      }
    };
  }

  quotaUsage() {
    return this.dailyQuotaService.getUsage();
  }
}
