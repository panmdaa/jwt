import { CloseCode } from "../constants";

/**
 * Returns `true` when the code may be sent on the wire: one of the standard
 * codes defined by RFC 6455 or a private/custom code in the 3000-4999 range.
 */
export function isValidCloseCode(code: number): boolean {
	if (
		code === CloseCode.NormalClosure ||
		code === CloseCode.GoingAway ||
		code === CloseCode.ProtocolError ||
		code === CloseCode.UnsupportedData ||
		code === CloseCode.InvalidFramePayloadData ||
		code === CloseCode.PolicyViolation ||
		code === CloseCode.MessageTooBig ||
		code === CloseCode.MandatoryExtension ||
		code === CloseCode.InternalServerError
	) {
		return true;
	}

	return code >= 3000 && code < 5000;
}
