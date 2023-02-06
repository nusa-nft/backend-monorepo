/**
 * Handles BigInt typed data and turn it into string 
 */

import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

const isPlainObject = v => (!!v && typeof v === 'object' && (v.__proto__ === null || v.__proto__ === Object.prototype));

const recursivelyParseBigInt = (value) => {
  if (Array.isArray(value)) {
    return value.map(recursivelyParseBigInt);
  }
  if (value !== null && isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [key, recursivelyParseBigInt(value)])
    );
  }
  if (typeof value == 'bigint') {
    return value.toString();
  }
  return value;
}

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next
      .handle()
      .pipe(map(value => recursivelyParseBigInt(value)));
  }
}