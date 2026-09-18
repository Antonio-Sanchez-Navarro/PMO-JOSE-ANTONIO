import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ObrasService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.obra.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }
}
