'use client';

import { useEffect, useRef, useState } from 'react';

import { useTranslation } from '@/i18n/useTranslation';
import { AdminIcon } from '../../../_ui/icons';
import styles from './OrderDetail.module.css';

/**
 * The customer's receipt address, with one copy control.
 *
 * The address is rendered on the server from the request's own host, so what the owner reads is the
 * address a customer would open - never a hardcoded domain. Copying happens in the browser, where the
 * clipboard lives; a browser that refuses the clipboard (an insecure context, a permission prompt)
 * simply leaves the button unchanged rather than claiming a copy that did not happen.
 */
export function ReceiptLink({ href }: { href: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(href);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className={styles.receiptBox}>
      <AdminIcon name="link" />
      <a className={styles.receiptLink} href={href} target="_blank" rel="noopener noreferrer">
        {href}
      </a>
      {copied ? (
        <span className={styles.copied}>{t('admin.order.receiptCopied')}</span>
      ) : (
        <button
          type="button"
          className={styles.copyButton}
          onClick={copy}
          aria-label={t('admin.order.receiptCopy')}
          title={t('admin.order.receiptCopy')}
        >
          <AdminIcon name="copy" />
        </button>
      )}
    </div>
  );
}