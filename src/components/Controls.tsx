import type { FC } from 'hono/jsx';

// Configuration and search fields must never be treated as login credentials.
export const FieldInput: FC<any> = (props) => (
    <input {...props} autocomplete="off" data-1p-ignore="true" data-op-ignore="true" />
);
