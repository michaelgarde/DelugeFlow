/**
 * Options configuration and validation
 */

export interface FieldConfig {
  id: string;
  def: unknown;
  validate?: (value: string) => boolean;
  validate_message?: string;
  required?: boolean;
  scrubber?: (value: string) => string;
}

export class OptionsConfig {
  /**
   * URL validation regex
   */
  static readonly URL_REGEX = /^(http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/[\w#!:.?+=&%@!\-\/])?/;

  /**
   * Connection field configurations
   */
  static readonly CONNECTION_DEFAULTS: FieldConfig[] = [
    {
      id: 'url',
      def: '',
      validate: (value: string) => {
        if (!value) return false;
        return OptionsConfig.URL_REGEX.test(value);
      },
      validate_message: 'Invalid server url.',
      required: true,
      scrubber: (value: string) => {
        if (!value) return '';
        if (value.substring(0, 4) !== 'http') return 'http://' + value;
        return value;
      },
    },
    {
      id: 'pass',
      def: '',
      validate: () => true,
      required: false,
    },
  ];

  /**
   * General option configurations
   */
  static readonly DEFAULTS: FieldConfig[] = [
    { id: 'inpage_notification', def: true },
    { id: 'enable_context_menu', def: true },
    { id: 'enable_context_menu_with_options', def: true },
    { id: 'enable_keyboard_macro', def: true },
    { id: 'enable_leftclick', def: true },
    { id: 'send_cookies', def: true },
    { id: 'intercept_torrent_downloads', def: true },
    { id: 'link_regex', def: '' },
    { id: 'enable_debug_logging', def: false },
    { id: 'popup_width', def: 480 },
    { id: 'popup_height', def: 450 },
  ];

  /**
   * Label option configurations
   */
  static readonly LABEL_DEFAULTS: FieldConfig[] = [
    { id: 'default_label', def: '' },
  ];
}
