'use client';

import Link from 'next/link';

import { useTranslation } from '@/i18n/useTranslation';
import { AdminNav, type AdminNavItem } from './AdminNav';
import styles from '../admin.module.css';

export type AdminIdentity = {
  readonly displayName: string;
  /** Role codes held. Localized where a label is known, otherwise shown as recorded. */
  readonly roleCodes: readonly string[];
  readonly csrfToken: string;
};

/**
 * The admin header.
 *
 * A client component so every label is localized: the locale lives in a client store, so text
 * rendered on the server would stay in the default locale while the rest of the interface switched.
 * The identity and the navigation come from the server, which derived them from the session.
 */
export function AdminHeader({ identity, items }: { identity: AdminIdentity; items: readonly AdminNavItem[] }) {
  const { t } = useTranslation();

  const roleLabel =
    identity.roleCodes.length === 0
      ? t('admin.session.noRoles')
      : identity.roleCodes
          .map((code) => (code === 'owner' ? t('admin.session.roleOwner') : code))
          .join(', ');

  return (
    <>
      <a className="skip-link" href="#admin-main">
        {t('admin.skipToContent')}
      </a>
      <header className={styles.shellHeader}>
      <div className={styles.shellHeaderInner}>
        <Link href="/admin" className={styles.brand}>
          QueenBee&apos;s <span className={styles.brandMark}>{t('admin.title')}</span>
        </Link>
        <AdminNav items={items} />
        <div className={styles.session}>
          <span className={styles.sessionIdentity}>
            <span className={styles.sessionName}>{identity.displayName}</span>
            <span>{roleLabel}</span>
          </span>
          {/* A native form post, so signing out works without JavaScript. It is CSRF-checked by the
              same guard every other state-changing route uses. */}
          <form action="/api/admin/session/logout" method="post">
            <input type="hidden" name="csrf" value={identity.csrfToken} />
            <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
              {t('admin.session.signOut')}
            </button>
          </form>
        </div>
      </div>
      </header>
    </>
  );
}
