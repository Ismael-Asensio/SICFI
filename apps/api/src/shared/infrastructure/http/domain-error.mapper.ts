/**
 * Traduce un `DomainError` a su excepción HTTP.
 *
 * **Único sitio de la aplicación donde se lanza una excepción HTTP** — el
 * dominio devuelve `Result`, nunca lanza (CLAUDE.md §8).
 *
 * ── Por qué `NotFoundError` es 404 y no 403 ──────────────────────────────
 * CLAUDE.md §7: cuando alguien pide un recurso de otro household, la respuesta
 * es **404, no 403**. Un 403 confirmaría que el recurso EXISTE y que
 * simplemente no es suyo; repitiendo la llamada con distintos ids se puede
 * enumerar qué tiene el vecino. El 404 no distingue "no existe" de "no es
 * tuyo", y esa ambigüedad es justo la que hay que preservar.
 *
 * Como la `tenantExtension` hace que un recurso ajeno sencillamente no
 * aparezca, los repositorios devuelven `null` y los casos de uso construyen un
 * `NotFoundError` sin tener que pensar en esto: sale 404 solo.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import type { DomainError } from '../../domain/domain-error';

export function toHttpException(error: DomainError): HttpException {
  const body = { code: error.code, message: error.message, details: error.details };

  switch (error.code) {
    case 'VALIDATION_ERROR':
      return new BadRequestException(body);
    case 'NOT_FOUND':
      return new NotFoundException(body);
    case 'CONFLICT':
      return new ConflictException(body);
    case 'FORBIDDEN':
      return new ForbiddenException(body);
    case 'BUSINESS_RULE_VIOLATION':
      // Una regla de negocio infringida es una petición bien formada que el
      // estado actual no permite: 409, no 400.
      return new ConflictException(body);
    case 'CURRENCY_MISMATCH':
      // Mezclar monedas es un bug del servidor, no un dato malo del usuario.
      return new InternalServerErrorException(body);
    default:
      return new InternalServerErrorException(body);
  }
}
