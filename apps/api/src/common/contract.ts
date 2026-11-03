/**
 * Request validation straight from the OpenAPI contract (ADR-001): the schema in
 * openapi.yaml is the only place a rule like "password ≥ 8 characters" is written.
 */
import { readFileSync } from 'node:fs';
import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { validationFailed, type FieldError } from './problem';

const openapi = JSON.parse(
  readFileSync(require.resolve('@taskflow/api-contract/openapi.json'), 'utf8'),
) as { components: { schemas: Record<string, unknown> } };

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema({ $id: 'contract', components: openapi.components }, 'contract');

function toFieldErrors(errors: ErrorObject[]): FieldError[] {
  return errors.map((e) => {
    const missing =
      e.keyword === 'required' ? (e.params as { missingProperty: string }).missingProperty : null;
    const path = e.instancePath.replace(/^\//, '').replace(/\//g, '.');
    return { field: missing ?? (path || '(body)'), message: e.message ?? 'is invalid' };
  });
}

/** Throws a 422 problem unless `body` matches components/schemas/<name>. */
export function assertBody<T>(schemaName: string, body: unknown): T {
  const validate = ajv.getSchema(`contract#/components/schemas/${schemaName}`);
  if (!validate) throw new Error(`Unknown schema ${schemaName}`);
  if (!validate(body)) throw validationFailed(toFieldErrors(validate.errors ?? []));
  return body as T;
}
