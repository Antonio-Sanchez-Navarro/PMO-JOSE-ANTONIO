import { Controller, Get, Post, Body, Query, UseGuards, ParseIntPipe, DefaultValuePipe, Logger, HttpCode } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { GmailService, EmailSnippet } from './gmail.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserContext } from '../auth/auth.types';

@Controller()
export class GmailController {
  private readonly logger = new Logger(GmailController.name);

  constructor(
    private readonly gmailService: GmailService,
    @InjectQueue('gmail-sync') private readonly gmailQueue: Queue,
  ) {}

  @Get('gmail/inbox')
  @UseGuards(AuthGuard)
  async getInbox(
    @CurrentUser() user: CurrentUserContext,
    @Query('maxResults', new DefaultValuePipe(20), ParseIntPipe) maxResults: number,
  ): Promise<EmailSnippet[]> {
    // `AuthGuard` expone el id como `userId` (ver auth.types.ts), no como `id`.
    return this.gmailService.getInbox(user.userId, maxResults);
  }

  @Post('webhooks/gmail')
  @HttpCode(200)
  async handleGmailWebhook(@Body() body: any) {
    if (!body || !body.message || !body.message.data) {
      this.logger.warn('Recibido webhook inválido (sin body.message.data)');
      return 'OK'; // Devolver 200 siempre a Google Pub/Sub para que no reintente con error
    }

    try {
      const decodedData = Buffer.from(body.message.data, 'base64').toString('utf-8');
      const payload = JSON.parse(decodedData);
      
      const emailAddress = payload.emailAddress;
      if (emailAddress) {
        this.logger.log(`Webhook de Gmail recibido para: ${emailAddress}`);
        
        // En vez de buscar el userId por correo aquí (lo cual requeriría Prisma),
        // pasamos el emailAddress al worker y allí se asocia. 
        // Opcionalmente podemos asumir que payload también trae algo útil, 
        // pero vamos a encolar con emailAddress.
        await this.gmailQueue.add('sync-history', { emailAddress });
      }
    } catch (err) {
      this.logger.error('Error parseando payload de webhook de Gmail', err);
    }

    return 'OK';
  }
}
