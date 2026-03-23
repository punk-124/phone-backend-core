import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DailyQuotaService {
  private readUsed = 0;
  private writeUsed = 0;
  private currentDayKey = '';
  private readonly maxReadRows: number;
  private readonly maxWriteRows: number;
  private readonly timeZone: string;

  constructor(private readonly configService: ConfigService) {
    this.maxReadRows = Number(this.configService.get('DAILY_READ_LIMIT') ?? 5_000_000);
    this.maxWriteRows = Number(this.configService.get('DAILY_WRITE_LIMIT') ?? 100_000);
    this.timeZone = this.configService.get('QUOTA_TIMEZONE') ?? 'Asia/Shanghai';
    this.currentDayKey = this.getDayKey();
  }

  consumeRead(rows: number, actionLabel: string): void {
    this.rollDayIfNeeded();
    if (this.readUsed + rows > this.maxReadRows) {
      throw new HttpException(
        this.buildExceededMessage(actionLabel),
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    this.readUsed += rows;
  }

  consumeWrite(rows: number, actionLabel: string): void {
    this.rollDayIfNeeded();
    if (this.writeUsed + rows > this.maxWriteRows) {
      throw new HttpException(
        this.buildExceededMessage(actionLabel),
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    this.writeUsed += rows;
  }

  getUsage() {
    this.rollDayIfNeeded();
    return {
      day: this.currentDayKey,
      readUsed: this.readUsed,
      readLimit: this.maxReadRows,
      writeUsed: this.writeUsed,
      writeLimit: this.maxWriteRows
    };
  }

  private rollDayIfNeeded(): void {
    const dayKey = this.getDayKey();
    if (dayKey === this.currentDayKey) {
      return;
    }
    this.currentDayKey = dayKey;
    this.readUsed = 0;
    this.writeUsed = 0;
  }

  private getDayKey(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  }

  private buildExceededMessage(actionLabel: string): string {
    return `\u4eca\u5929\u5df2\u7ecf\u4e0d\u80fd${actionLabel}\u4e86\uff0c\u660e\u5929\u518d\u6765\u5427`;
  }
}
