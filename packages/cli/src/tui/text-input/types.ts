export interface TextInputConfig {
  readonly message: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly validate?: (value: string) => string | undefined;
}
