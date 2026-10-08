import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CancelOrderDto, CancelReasonEnum } from './cancel-order.dto';

/**
 * Contract tests for the cancellation payload. The reason codes accepted here
 * are the single backend-owned set the client's dropdown is driven by, so a
 * code the client invents (e.g. `delivery_delayed`) must be rejected.
 */
describe('CancelOrderDto', () => {
  const validate = (payload: Record<string, unknown>) => {
    const dto = plainToInstance(CancelOrderDto, payload);
    return { dto, errors: validateSync(dto) };
  };

  const errorsFor = (payload: Record<string, unknown>, property: string) =>
    validate(payload).errors.filter((e) => e.property === property);

  describe('reason', () => {
    it.each([
      CancelReasonEnum.CHANGED_MIND,
      CancelReasonEnum.ORDERED_BY_MISTAKE,
      CancelReasonEnum.FOUND_CHEAPER,
      CancelReasonEnum.DELIVERY_TOO_SLOW,
      CancelReasonEnum.CHANGE_ITEMS,
    ])('accepts the supported code %s', (reason) => {
      expect(errorsFor({ reason }, 'reason')).toHaveLength(0);
    });

    it('accepts change_items', () => {
      const { dto, errors } = validate({ reason: 'change_items' });
      expect(errors).toHaveLength(0);
      expect(dto.reason).toBe(CancelReasonEnum.CHANGE_ITEMS);
    });

    it('accepts delivery_too_slow', () => {
      const { dto, errors } = validate({ reason: 'delivery_too_slow' });
      expect(errors).toHaveLength(0);
      expect(dto.reason).toBe(CancelReasonEnum.DELIVERY_TOO_SLOW);
    });

    it('rejects delivery_delayed, which is not a supported code', () => {
      const errors = errorsFor({ reason: 'delivery_delayed' }, 'reason');
      expect(errors).toHaveLength(1);
      expect(Object.values(errors[0].constraints ?? {})[0]).toContain(
        'delivery_too_slow',
      );
    });

    it('rejects a missing or empty reason', () => {
      expect(errorsFor({}, 'reason')).toHaveLength(1);
      expect(errorsFor({ reason: '' }, 'reason')).toHaveLength(1);
    });

    it('normalizes case and surrounding whitespace', () => {
      const { dto, errors } = validate({ reason: '  DELIVERY_TOO_SLOW  ' });
      expect(errors).toHaveLength(0);
      expect(dto.reason).toBe(CancelReasonEnum.DELIVERY_TOO_SLOW);
    });
  });

  describe('reasonOther', () => {
    it('is required when the reason is other', () => {
      const errors = errorsFor({ reason: 'other' }, 'reasonOther');
      expect(errors).toHaveLength(1);
    });

    it('rejects a blank note when the reason is other', () => {
      expect(
        errorsFor({ reason: 'other', reasonOther: '   ' }, 'reasonOther'),
      ).toHaveLength(1);
    });

    it('accepts a note when the reason is other', () => {
      expect(
        errorsFor(
          { reason: 'other', reasonOther: 'Ordered the wrong size' },
          'reasonOther',
        ),
      ).toHaveLength(0);
    });

    it('accepts exactly 200 characters and rejects 201', () => {
      expect(
        errorsFor({ reason: 'other', reasonOther: 'x'.repeat(200) }, 'reasonOther'),
      ).toHaveLength(0);

      const tooLong = errorsFor(
        { reason: 'other', reasonOther: 'x'.repeat(201) },
        'reasonOther',
      );
      expect(tooLong).toHaveLength(1);
      expect(Object.values(tooLong[0].constraints ?? {})[0]).toContain('200');
    });

    it('is not required for any other reason, but is still length-capped', () => {
      expect(errorsFor({ reason: 'changed_mind' }, 'reasonOther')).toHaveLength(0);
      expect(
        errorsFor(
          { reason: 'changed_mind', reasonOther: 'x'.repeat(201) },
          'reasonOther',
        ),
      ).toHaveLength(1);
    });
  });
});
