import type { OutgoingHttpHeaders } from "node:http";

export type Status =
	| 100
	| 101
	| 102
	| 103
	| 200
	| 201
	| 202
	| 203
	| 204
	| 205
	| 206
	| 207
	| 208
	| 214
	| 226
	| 300
	| 301
	| 302
	| 303
	| 304
	| 305
	| 308
	| 400
	| 401
	| 402
	| 403
	| 404
	| 405
	| 406
	| 407
	| 408
	| 409
	| 410
	| 411
	| 412
	| 413
	| 414
	| 415
	| 416
	| 417
	| 418
	| 419
	| 420
	| 421
	| 422
	| 423
	| 424
	| 425
	| 426
	| 427
	| 428
	| 429
	| 431
	| 444
	| 450
	| 451
	| 495
	| 496
	| 497
	| 499
	| 500
	| 501
	| 502
	| 503
	| 504
	| 505
	| 506
	| 507
	| 508
	| 509
	| 510
	| 511
	| 521
	| 522
	| 523
	| 525
	| 530
	| 599;

export type CommonVary =
	| "*"
	| "Accept"
	| "Accept-Charset"
	| "Accept-Encoding"
	| "Accept-Language"
	| "Accept-Ranges"
	| "Authorization"
	| "Cookie"
	| "Origin"
	| "Referer"
	| "User-Agent"
	| "Host"
	| "Range"
	| "If-None-Match"
	| "If-Modified-Since"
	| "Sec-Fetch-Dest"
	| "Sec-Fetch-Mode"
	| "Sec-Fetch-Site"
	| "Sec-Fetch-User"
	| "Sec-CH-UA"
	| "Sec-CH-UA-Arch"
	| "Sec-CH-UA-Bitness"
	| "Sec-CH-UA-Full-Version"
	| "Sec-CH-UA-Full-Version-List"
	| "Sec-CH-UA-Mobile"
	| "Sec-CH-UA-Model"
	| "Sec-CH-UA-Platform"
	| "Sec-CH-UA-Platform-Version"
	| "Sec-CH-UA-WoW64";

type RemoveIndexSignature<T> = {
	[K in keyof T as string extends K
		? never
		: number extends K
			? never
			: symbol extends K
				? never
				: K]: T[K];
};

export type HeadersKey =
	| keyof RemoveIndexSignature<OutgoingHttpHeaders>
	| (string & {});
