import { ConflictException, NotFoundException } from '@nestjs/common';
import { TaskSource } from '@prisma/client';
import { EmailsService } from './emails.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailClassificationService } from '../ai/email-classification.service';
import { emailNoAccionable, emailSinTexto } from '../ai/__fixtures__/emails.fixture';

const USER_ID = 'user-1';

describe('EmailsService — POST /emails/:id/to-task', () => {
  let service: EmailsService;
  let prisma: any;
  let classification: { classifyAndPersist: jest.Mock };

  beforeEach(() => {
    prisma = {
      email: { findFirst: jest.fn().mockResolvedValue(emailNoAccionable) },
      task: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-1', ...data })),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'task-1', ...data })),
      },
    };
    classification = {
      classifyAndPersist: jest.fn().mockResolvedValue({
        isActionable: true,
        category: 'OTHER',
        usedFallback: true,
        tasks: [{ id: 'task-1', title: emailNoAccionable.subject, priority: 'MEDIUM' }],
      }),
    };

    service = new EmailsService(
      prisma as unknown as PrismaService,
      classification as unknown as EmailClassificationService,
    );
  });

  describe('propiedad del correo', () => {
    it('devuelve 404 si el correo no existe o no es del usuario', async () => {
      prisma.email.findFirst.mockResolvedValue(null);

      await expect(service.convertToTask(USER_ID, 'otro-id', {})).rejects.toThrow(NotFoundException);
    });

    it('filtra por userId además de por id', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: 'x' });

      expect(prisma.email.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: emailNoAccionable.id, userId: USER_ID } }),
      );
    });
  });

  describe('protección contra duplicados', () => {
    it('devuelve 409 si el correo ya tiene tareas', async () => {
      prisma.task.count.mockResolvedValue(2);

      await expect(service.convertToTask(USER_ID, emailNoAccionable.id, {})).rejects.toThrow(
        ConflictException,
      );
      expect(classification.classifyAndPersist).not.toHaveBeenCalled();
    });

    it('con force: true crea otra aunque ya existan', async () => {
      prisma.task.count.mockResolvedValue(2);

      const result = await service.convertToTask(USER_ID, emailNoAccionable.id, {
        title: 'Otra más',
        force: true,
      });

      expect(result.tasks).toHaveLength(1);
    });

    it('ni siquiera consulta el conteo cuando llega force', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: 'x', force: true });

      expect(prisma.task.count).not.toHaveBeenCalled();
    });
  });

  describe('modo manual (con title)', () => {
    it('no llama al modelo: la conversión manual no cuesta tokens', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: 'A mano' });

      expect(classification.classifyAndPersist).not.toHaveBeenCalled();
    });

    it('marca la tarea como manual para que el reproceso no la borre', async () => {
      const result = await service.convertToTask(USER_ID, emailNoAccionable.id, { title: 'A mano' });

      expect(result.mode).toBe('manual');
      expect(prisma.task.create.mock.calls[0][0].data.source).toBe(TaskSource.MANUAL);
    });

    it('aplica priority y dueDate del cuerpo', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, {
        title: 'A mano',
        priority: 'URGENT' as any,
        dueDate: '2026-08-15T00:00:00.000Z',
      });

      const data = prisma.task.create.mock.calls[0][0].data;
      expect(data.priority).toBe('URGENT');
      expect(data.dueDate).toEqual(new Date('2026-08-15T00:00:00.000Z'));
    });

    it('recorta el título y usa el snippet como descripción por defecto', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: '   Con espacios   ' });

      const data = prisma.task.create.mock.calls[0][0].data;
      expect(data.title).toBe('Con espacios');
      expect(data.description).toBe(emailNoAccionable.snippet);
    });

    it('un title en blanco no cuenta como modo manual', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, { title: '   ' });

      expect(classification.classifyAndPersist).toHaveBeenCalled();
    });
  });

  describe('modo IA (sin title)', () => {
    it('fuerza la creación aunque el modelo no vea el correo accionable', async () => {
      const result = await service.convertToTask(USER_ID, emailNoAccionable.id, {});

      expect(classification.classifyAndPersist).toHaveBeenCalledWith(emailNoAccionable.id, {
        replaceExisting: false,
        forceActionable: true,
      });
      expect(result.mode).toBe('ai');
      expect(result.usedFallback).toBe(true);
    });

    it('rechaza el correo sin texto pidiendo un title', async () => {
      prisma.email.findFirst.mockResolvedValue(emailSinTexto);

      await expect(service.convertToTask(USER_ID, emailSinTexto.id, {})).rejects.toThrow(
        /Envía "title"/,
      );
    });

    it('los campos del cuerpo pisan lo que dijo el modelo', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, {
        priority: 'LOW' as any,
        dueDate: '2026-09-01T00:00:00.000Z',
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: 'task-1' },
        data: { priority: 'LOW', dueDate: new Date('2026-09-01T00:00:00.000Z') },
      });
    });

    it('no toca la tarea si el cuerpo no traía overrides', async () => {
      await service.convertToTask(USER_ID, emailNoAccionable.id, {});

      expect(prisma.task.update).not.toHaveBeenCalled();
    });
  });
});
