'use client';

import { useTranslation } from '@/i18n/useTranslation';
import styles from '../../admin.module.css';

export type StaffRow = {
  id: number;
  email: string;
  displayName: string;
  status: string;
  disabledAt: string | null;
  lastSeenAt: string | null;
  roles: { code: string; name: string }[];
  hasCredential: boolean;
};

export type RoleRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isOwnerLevel: boolean;
  permissionCount: number;
};

export type StaffNotice =
  | 'roleGranted'
  | 'roleRevoked'
  | 'tokenIssued'
  | 'disabled'
  | 'enabled'
  | 'denied'
  | 'conflict'
  | 'exists'
  | 'invalid';

const NOTICE_KEYS = {
  roleGranted: 'admin.staff.roleGranted',
  roleRevoked: 'admin.staff.roleRevoked',
  tokenIssued: 'admin.staff.tokenIssued',
  disabled: 'admin.staff.disabled',
  enabled: 'admin.staff.enabled',
  denied: 'admin.staff.denied',
  conflict: 'admin.staff.conflict',
  exists: 'admin.staff.exists',
  invalid: 'admin.staff.invalidInput',
} as const;

const ERROR_NOTICES: readonly StaffNotice[] = ['denied', 'conflict', 'exists', 'invalid'];

/**
 * Staff and roles.
 *
 * Every control here is a plain form post to a route handler that re-checks the permission and the
 * CSRF token server-side, so the interface is a convenience and never the control. Buttons that the
 * server would refuse for the signed-in actor are omitted, and the server refuses them anyway.
 */
export function StaffView({
  staff,
  roles,
  currentStaffUserId,
  canManage,
  notice,
  issuedToken,
  csrfToken,
}: {
  staff: readonly StaffRow[];
  roles: readonly RoleRow[];
  currentStaffUserId: number;
  canManage: boolean;
  notice: StaffNotice | null;
  issuedToken: { token: string; expiresAt: string } | null;
  /** Rendered by the server from the session. Never read from the DOM. */
  csrfToken: string;
}) {
  const { t, locale } = useTranslation();
  const formatDate = (iso: string | null): string =>
    iso === null
      ? t('admin.staff.never')
      : new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(iso));

  const roleLabel = (code: string, name: string): string =>
    code === 'owner' ? t('admin.session.roleOwner') : name;

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h1>{t('admin.staff.title')}</h1>
          <p>{t('admin.staff.body')}</p>
        </div>

        {notice !== null ? (
          <p
            className={`${styles.alert} ${ERROR_NOTICES.includes(notice) ? styles.alertError : styles.alertSuccess}`}
            role="status"
          >
            {t(NOTICE_KEYS[notice])}
          </p>
        ) : null}

        {issuedToken !== null ? (
          <div className={styles.tokenBox} role="status">
            <strong>{t('admin.staff.tokenTitle')}</strong>
            <p className={styles.note}>{t('admin.staff.tokenBody')}</p>
            <code className={styles.tokenValue}>{issuedToken.token}</code>
            <p className={styles.note}>
              {t('admin.staff.tokenExpires')}: {formatDate(issuedToken.expiresAt)}
            </p>
            <p className={styles.note}>
              {t('admin.redeem.tokenHelp')}
            </p>
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>{t('admin.staff.listTitle')}</h2>
        </div>
        {staff.length === 0 ? (
          <div className={styles.tableWrap}>
            <p className={styles.empty}>{t('admin.staff.empty')}</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="visually-hidden">{t('admin.staff.listTitle')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('admin.staff.displayName')}</th>
                  <th scope="col">{t('admin.staff.roles')}</th>
                  <th scope="col">{t('admin.staff.status')}</th>
                  <th scope="col">{t('admin.staff.lastSeen')}</th>
                  {canManage ? <th scope="col">{t('admin.staff.actions')}</th> : null}
                </tr>
              </thead>
              <tbody>
                {staff.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.displayName}</strong>
                      <br />
                      <span className={styles.note}>{row.email}</span>
                      <br />
                      <span className={styles.note}>
                        {row.hasCredential ? t('admin.staff.credentialSet') : t('admin.staff.credentialNotSet')}
                      </span>
                    </td>
                    <td>
                      {row.roles.length === 0 ? (
                        <span className={`${styles.tag} ${styles.tagMuted}`}>{t('admin.session.noRoles')}</span>
                      ) : (
                        row.roles.map((role) => (
                          <span className={styles.tag} key={role.code}>
                            {roleLabel(role.code, role.name)}
                          </span>
                        ))
                      )}
                    </td>
                    <td>
                      <span className={row.status === 'active' ? styles.tag : `${styles.tag} ${styles.tagWarn}`}>
                        {row.status === 'active' ? t('admin.staff.statusActive') : t('admin.staff.statusDisabled')}
                      </span>
                    </td>
                    <td>{formatDate(row.lastSeenAt)}</td>
                    {canManage ? (
                      <td>
                        <StaffActions row={row} roles={roles} isSelf={row.id === currentStaffUserId} csrfToken={csrfToken} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage ? (
        <>
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>{t('admin.staff.createTitle')}</h2>
              <p>{t('admin.staff.createBody')}</p>
            </div>
            <div className={styles.panel}>
              <form className={styles.form} action="/api/admin/staff" method="post">
                <CsrfField token={csrfToken} />
                <div className={styles.field}>
                  <label htmlFor="staff-email">{t('admin.login.email')}</label>
                  <input
                    id="staff-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="off"
                    aria-describedby="staff-email-hint"
                  />
                  <span className={styles.hint} id="staff-email-hint">
                    {t('admin.validation.emailInvalid')}
                  </span>
                </div>
                <div className={styles.field}>
                  <label htmlFor="staff-name">{t('admin.staff.displayName')}</label>
                  <input id="staff-name" name="displayName" type="text" required maxLength={80} autoComplete="off" />
                </div>
                <div className={styles.field}>
                  <label htmlFor="staff-role">{t('admin.staff.roles')}</label>
                  <select id="staff-role" name="roleCode" required defaultValue="">
                    <option value="" disabled>
                      {t('admin.validation.roleRequired')}
                    </option>
                    {roles.map((role) => (
                      <option key={role.code} value={role.code}>
                        {roleLabel(role.code, role.name)}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className={styles.button}>
                  {t('admin.staff.createSubmit')}
                </button>
              </form>
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>{t('admin.staff.rolesTitle')}</h2>
              <p>{t('admin.staff.rolesBody')}</p>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="visually-hidden">{t('admin.staff.rolesTitle')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('admin.staff.roles')}</th>
                    <th scope="col">{t('admin.overview.permissions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((role) => (
                    <tr key={role.code}>
                      <td>
                        <strong>{roleLabel(role.code, role.name)}</strong>
                        {role.description !== null ? (
                          <>
                            <br />
                            <span className={styles.note}>{role.description}</span>
                          </>
                        ) : null}
                      </td>
                      <td>{t('admin.staff.permissionCount', { count: role.permissionCount })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>{t('admin.staff.selfNote')}</p>
            <p className={styles.note}>{t('admin.staff.lastOwnerNote')}</p>
          </section>
        </>
      ) : null}
    </>
  );
}

/**
 * The session-bound CSRF field.
 *
 * Declared at module scope, not inside a render: a component created during render is a new type on
 * every pass, which remounts its subtree and discards state.
 */
function CsrfField({ token }: { token: string }) {
  return <input type="hidden" name="csrf" value={token} />;
}

/**
 * Per-row actions. Each is a plain form post to a route handler that re-checks the permission and the
 * CSRF token server-side.
 */
function StaffActions({ row, roles, isSelf, csrfToken }: { row: StaffRow; roles: readonly RoleRow[]; isSelf: boolean; csrfToken: string }) {
  const { t } = useTranslation();
  const heldCodes = row.roles.map((role) => role.code);
  const grantable = roles.filter((role) => !heldCodes.includes(role.code));

  if (isSelf) {
    return <span className={styles.note}>{t('admin.staff.selfNote')}</span>;
  }

  return (
    <div className={styles.inlineForm}>
      {grantable.map((role) => (
        <form action="/api/admin/staff/role" method="post" key={`grant-${role.code}`}>
          <CsrfField token={csrfToken} />
          <input type="hidden" name="staffUserId" value={row.id} />
          <input type="hidden" name="roleCode" value={role.code} />
          <input type="hidden" name="operation" value="grant" />
          <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
            {t('admin.staff.grantRole')}: {role.code === 'owner' ? t('admin.session.roleOwner') : role.name}
          </button>
        </form>
      ))}

      {heldCodes.map((code) => {
        const role = roles.find((candidate) => candidate.code === code);
        return (
          <form action="/api/admin/staff/role" method="post" key={`revoke-${code}`}>
            <CsrfField token={csrfToken} />
            <input type="hidden" name="staffUserId" value={row.id} />
            <input type="hidden" name="roleCode" value={code} />
            <input type="hidden" name="operation" value="revoke" />
            <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
              {t('admin.staff.revokeRole')}: {code === 'owner' ? t('admin.session.roleOwner') : (role?.name ?? code)}
            </button>
          </form>
        );
      })}

      <form action="/api/admin/staff/credential" method="post">
        <CsrfField token={csrfToken} />
        <input type="hidden" name="staffUserId" value={row.id} />
        <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
          {t('admin.staff.issueToken')}
        </button>
      </form>

      <form action="/api/admin/staff/status" method="post">
        <CsrfField token={csrfToken} />
        <input type="hidden" name="staffUserId" value={row.id} />
        <input type="hidden" name="operation" value={row.status === 'active' ? 'disable' : 'enable'} />
        <button type="submit" className={`${styles.button} ${styles.buttonSecondary} ${styles.buttonSmall}`}>
          {row.status === 'active' ? t('admin.staff.disable') : t('admin.staff.enable')}
        </button>
      </form>
    </div>
  );
}
