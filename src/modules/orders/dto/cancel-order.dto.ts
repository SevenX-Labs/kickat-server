import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Preset cancellation reasons.
 *
 * The first four values are the original codes and are kept for backward
 * compatibility with clients already sending them. The remaining values were
 * added to cover the full customer-facing reason list.
 */
export enum CancelReasonEnum {
  CHANGED_MIND = 'changed_mind',
  ORDERED_BY_MISTAKE = 'ordered_by_mistake',
  FOUND_CHEAPER = 'found_cheaper',
  OTHER = 'other',
  DELIVERY_TOO_SLOW = 'delivery_too_slow',
  CHANGE_ITEMS = 'change_items',
}

/**
 * Human-readable labels for each reason code. Exposed to the client through
 * `cancellationReasons` on the order detail response so the dropdown is driven
 * by the backend rather than hardcoded in the frontend.
 */
export const CANCEL_REASON_LABELS: Record<CancelReasonEnum, string> = {
  [CancelReasonEnum.ORDERED_BY_MISTAKE]: 'Ordered by mistake',
  [CancelReasonEnum.FOUND_CHEAPER]: 'Found a better price',
  [CancelReasonEnum.DELIVERY_TOO_SLOW]: 'Delivery taking too long',
  [CancelReasonEnum.CHANGE_ITEMS]: 'Want to change items/quantity',
  [CancelReasonEnum.CHANGED_MIND]: 'Changed my mind',
  [CancelReasonEnum.OTHER]: 'Other',
};

export class CancelOrderDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @IsEnum(CancelReasonEnum, {
    message:
      'reason must be one of: changed_mind, ordered_by_mistake, found_cheaper, delivery_too_slow, change_items, other',
  })
  reason: CancelReasonEnum;

  /**
   * Free-text note. Required when `reason` is `other` (enforced here and
   * re-checked in the service), optional for every other reason code.
   *
   * NOTE: `@IsOptional()` is deliberately NOT used — it would short-circuit
   * validation when the value is missing, which is exactly the case we must
   * reject for `other`. The ValidateIf condition instead runs validation when
   * the reason is `other` OR when the client supplied a value at all.
   */
  @ValidateIf(
    (dto: CancelOrderDto) =>
      dto.reason === CancelReasonEnum.OTHER || dto.reasonOther !== undefined,
  )
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'reasonOther must be a string' })
  @MinLength(1, { message: 'reasonOther must not be empty' })
  @MaxLength(200, { message: 'reasonOther must not exceed 200 characters' })
  reasonOther?: string;
}
