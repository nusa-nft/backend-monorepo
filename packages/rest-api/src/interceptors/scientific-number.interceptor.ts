/**
 * Handles BigInt typed data and turn it into string
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

const isPlainObject = (v) =>
  !!v &&
  typeof v === 'object' &&
  (v.__proto__ === null || v.__proto__ === Object.prototype);

const recursivelyParseScientific = (value) => {
  if (Array.isArray(value)) {
    return value.map(recursivelyParseScientific);
  }
  if (value !== null && isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [
        key,
        recursivelyParseScientific(value),
      ]),
    );
  }
  if (
    value !== null &&
    value !== undefined &&
    value.toString().includes('e+')
  ) {
    const transformed = Number(value).toLocaleString('fullwide', {
      useGrouping: false,
    });
    return transformed;
  }
  return value;
};

@Injectable()
export class ScientificNumberInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next
      .handle()
      .pipe(map((value) => recursivelyParseScientific(value)));
  }
}
