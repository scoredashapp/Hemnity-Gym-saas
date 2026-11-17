import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeImgProps {
  value: string;
  size?: number;
  className?: string;
  alt?: string;
}

export function QrCodeImg({ value, size = 160, className = '', alt = 'Member QR Pass' }: QrCodeImgProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (!value) {
      setDataUrl('');
      return;
    }
    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0c0e12',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-neutral-100 border border-neutral-200 flex items-center justify-center text-[10px] font-mono text-neutral-400 ${className}`}
      >
        QR
      </div>
    );
  }

  return <img src={dataUrl} alt={alt} width={size} height={size} className={className} />;
}
