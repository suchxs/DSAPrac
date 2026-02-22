import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ImageLightboxProps {
  imageUrl: string | null;
  alt?: string;
  onClose: () => void;
}

const EXIT_ANIMATION_MS = 260;

const ImageLightbox: React.FC<ImageLightboxProps> = ({ imageUrl, alt = 'Expanded image', onClose }) => {
  const [visibleUrl, setVisibleUrl] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (imageUrl) {
      setVisibleUrl(imageUrl);
      setIsClosing(false);
    }
  }, [imageUrl]);

  useEffect(() => {
    if (!visibleUrl) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visibleUrl, isClosing]);

  const requestClose = () => {
    if (isClosing) return;
    setIsClosing(true);

    window.setTimeout(() => {
      setVisibleUrl(null);
      setIsClosing(false);
      onClose();
    }, EXIT_ANIMATION_MS);
  };

  if (!visibleUrl) return null;

  return createPortal(
    <div
      className={`image-lightbox-overlay ${isClosing ? 'is-closing' : 'is-open'}`}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label="Expanded image preview"
    >
      <img
        src={visibleUrl}
        alt={alt}
        onClick={(event) => event.stopPropagation()}
        className={`image-lightbox-image ${isClosing ? 'is-closing' : 'is-open'}`}
      />
    </div>,
    document.body,
  );
};

export default ImageLightbox;
