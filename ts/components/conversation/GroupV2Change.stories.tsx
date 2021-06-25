// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable-next-line max-classes-per-file */
import * as React from 'react';
import { storiesOf } from '@storybook/react';

import { setup as setupI18n } from '../../../js/modules/i18n';
import enMessages from '../../../_locales/en/messages.json';
import { GroupV2ChangeType } from '../../groups';
import { SmartContactRendererType } from '../../groupChange';
import { GroupV2Change } from './GroupV2Change';

const i18n = setupI18n('en', enMessages);

const OUR_ID = 'OUR_ID';
const CONTACT_A = 'CONTACT_A';
const CONTACT_B = 'CONTACT_B';
const CONTACT_C = 'CONTACT_C';
const ADMIN_A = 'ADMIN_A';
const INVITEE_A = 'INVITEE_A';

class AccessControlEnum {
  static UNKNOWN = 0;

  static ANY = 1;

  static MEMBER = 2;

  static ADMINISTRATOR = 3;

  static UNSATISFIABLE = 4;
}

class RoleEnum {
  static UNKNOWN = 0;

  static ADMINISTRATOR = 1;

  static DEFAULT = 2;
}

const renderContact: SmartContactRendererType = (conversationId: string) => (
  <React.Fragment key={conversationId}>
    {`Conversation(${conversationId})`}
  </React.Fragment>
);

const renderChange = (change: GroupV2ChangeType, groupName?: string) => (
  <GroupV2Change
    AccessControlEnum={AccessControlEnum}
    change={change}
    groupName={groupName}
    i18n={i18n}
    ourConversationId={OUR_ID}
    renderContact={renderContact}
    RoleEnum={RoleEnum}
  />
);

storiesOf('Components/Conversation/GroupV2Change', module)
  .add('Multiple', () => {
    return (
      <>
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'title',
              newTitle: 'Saturday Running',
            },
            {
              type: 'avatar',
              removed: false,
            },
            {
              type: 'member-add',
              conversationId: OUR_ID,
            },
            {
              type: 'member-privilege',
              conversationId: OUR_ID,
              newPrivilege: RoleEnum.ADMINISTRATOR,
            },
          ],
        })}
      </>
    );
  })
  .add('Create', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'create',
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'create',
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'create',
            },
          ],
        })}
      </>
    );
  })
  .add('Title', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'title',
              newTitle: 'Saturday Running',
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'title',
              newTitle: 'Saturday Running',
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'title',
              newTitle: 'Saturday Running',
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'title',
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'title',
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'title',
            },
          ],
        })}
      </>
    );
  })
  .add('Avatar', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'avatar',
              removed: false,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'avatar',
              removed: false,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'avatar',
              removed: false,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'avatar',
              removed: true,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'avatar',
              removed: true,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'avatar',
              removed: true,
            },
          ],
        })}
      </>
    );
  })
  .add('Access (Attributes)', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'access-attributes',
              newPrivilege: AccessControlEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'access-attributes',
              newPrivilege: AccessControlEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'access-attributes',
              newPrivilege: AccessControlEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'access-attributes',
              newPrivilege: AccessControlEnum.MEMBER,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'access-attributes',
              newPrivilege: AccessControlEnum.MEMBER,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'access-attributes',
              newPrivilege: AccessControlEnum.MEMBER,
            },
          ],
        })}
      </>
    );
  })
  .add('Access (Members)', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'access-members',
              newPrivilege: AccessControlEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'access-members',
              newPrivilege: AccessControlEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'access-members',
              newPrivilege: AccessControlEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'access-members',
              newPrivilege: AccessControlEnum.MEMBER,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'access-members',
              newPrivilege: AccessControlEnum.MEMBER,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'access-members',
              newPrivilege: AccessControlEnum.MEMBER,
            },
          ],
        })}
      </>
    );
  })
  .add('Access (Invite Link)', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'access-invite-link',
              newPrivilege: AccessControlEnum.ANY,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'access-invite-link',
              newPrivilege: AccessControlEnum.ANY,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'access-invite-link',
              newPrivilege: AccessControlEnum.ANY,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'access-invite-link',
              newPrivilege: AccessControlEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'access-invite-link',
              newPrivilege: AccessControlEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'access-invite-link',
              newPrivilege: AccessControlEnum.ADMINISTRATOR,
            },
          ],
        })}
      </>
    );
  })
  .add('Member Add', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'member-add',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'member-add',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-add',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'member-add',
              conversationId: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_B,
          details: [
            {
              type: 'member-add',
              conversationId: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-add',
              conversationId: CONTACT_A,
            },
          ],
        })}
      </>
    );
  })
  .add('Member Add (from invited)', () => {
    return (
      <>
        {/* the strings where someone added you - shown like a normal add */}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'member-add-from-invite',
              conversationId: OUR_ID,
              inviter: CONTACT_B,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-add-from-invite',
              conversationId: OUR_ID,
              inviter: CONTACT_A,
            },
          ],
        })}
        {/* the rest of the 'someone added someone else' checks */}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'member-add-from-invite',
              conversationId: CONTACT_A,
              inviter: CONTACT_B,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'member-add-from-invite',
              conversationId: CONTACT_B,
              inviter: CONTACT_C,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-add-from-invite',
              conversationId: CONTACT_A,
              inviter: CONTACT_B,
            },
          ],
        })}
        {/* in all of these we know the user has accepted the invite */}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'member-add-from-invite',
              conversationId: OUR_ID,
              inviter: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'member-add-from-invite',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'member-add-from-invite',
              conversationId: CONTACT_A,
              inviter: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'member-add-from-invite',
              conversationId: CONTACT_A,
              inviter: CONTACT_B,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'member-add-from-invite',
              conversationId: CONTACT_A,
            },
          ],
        })}
      </>
    );
  })
  .add('Member Add (from link)', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'member-add-from-link',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'member-add-from-link',
              conversationId: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-add-from-link',
              conversationId: CONTACT_A,
            },
          ],
        })}
      </>
    );
  })
  .add('Member Add (from admin approval)', () => {
    return (
      <>
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'member-add-from-admin-approval',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-add-from-admin-approval',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'member-add-from-admin-approval',
              conversationId: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'member-add-from-admin-approval',
              conversationId: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-add-from-admin-approval',
              conversationId: CONTACT_A,
            },
          ],
        })}
      </>
    );
  })
  .add('Member Remove', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'member-remove',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'member-remove',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-remove',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'member-remove',
              conversationId: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'member-remove',
              conversationId: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_B,
          details: [
            {
              type: 'member-remove',
              conversationId: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-remove',
              conversationId: CONTACT_A,
            },
          ],
        })}
      </>
    );
  })
  .add('Member Privilege', () => {
    return (
      <>
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'member-privilege',
              conversationId: OUR_ID,
              newPrivilege: RoleEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-privilege',
              conversationId: OUR_ID,
              newPrivilege: RoleEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'member-privilege',
              conversationId: CONTACT_A,
              newPrivilege: RoleEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'member-privilege',
              conversationId: CONTACT_A,
              newPrivilege: RoleEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-privilege',
              conversationId: CONTACT_A,
              newPrivilege: RoleEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'member-privilege',
              conversationId: OUR_ID,
              newPrivilege: RoleEnum.DEFAULT,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-privilege',
              conversationId: OUR_ID,
              newPrivilege: RoleEnum.DEFAULT,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'member-privilege',
              conversationId: CONTACT_A,
              newPrivilege: RoleEnum.DEFAULT,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'member-privilege',
              conversationId: CONTACT_A,
              newPrivilege: RoleEnum.DEFAULT,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'member-privilege',
              conversationId: CONTACT_A,
              newPrivilege: RoleEnum.DEFAULT,
            },
          ],
        })}
      </>
    );
  })
  .add('Pending Add - one', () => {
    return (
      <>
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'pending-add-one',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'pending-add-one',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'pending-add-one',
              conversationId: INVITEE_A,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_B,
          details: [
            {
              type: 'pending-add-one',
              conversationId: INVITEE_A,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'pending-add-one',
              conversationId: INVITEE_A,
            },
          ],
        })}
      </>
    );
  })
  .add('Pending Add - many', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'pending-add-many',
              count: 5,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'pending-add-many',
              count: 5,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'pending-add-many',
              count: 5,
            },
          ],
        })}
      </>
    );
  })
  .add('Pending Remove - one', () => {
    return (
      <>
        {renderChange({
          from: INVITEE_A,
          details: [
            {
              type: 'pending-remove-one',
              conversationId: INVITEE_A,
              inviter: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'pending-remove-one',
              conversationId: INVITEE_A,
              inviter: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'pending-remove-one',
              conversationId: INVITEE_A,
              inviter: OUR_ID,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'pending-remove-one',
              conversationId: INVITEE_A,
              inviter: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: INVITEE_A,
          details: [
            {
              type: 'pending-remove-one',
              conversationId: INVITEE_A,
            },
          ],
        })}
        {renderChange({
          from: INVITEE_A,
          details: [
            {
              type: 'pending-remove-one',
              conversationId: INVITEE_A,
              inviter: CONTACT_B,
            },
          ],
        })}

        {renderChange({
          from: CONTACT_B,
          details: [
            {
              type: 'pending-remove-one',
              conversationId: OUR_ID,
              inviter: CONTACT_B,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'pending-remove-one',
              conversationId: CONTACT_B,
              inviter: CONTACT_A,
            },
          ],
        })}

        {renderChange({
          from: CONTACT_C,
          details: [
            {
              type: 'pending-remove-one',
              conversationId: INVITEE_A,
              inviter: CONTACT_B,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'pending-remove-one',
              conversationId: INVITEE_A,
              inviter: CONTACT_B,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'pending-remove-one',
              conversationId: INVITEE_A,
              inviter: CONTACT_B,
            },
          ],
        })}

        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'pending-remove-one',
              conversationId: INVITEE_A,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_B,
          details: [
            {
              type: 'pending-remove-one',
              conversationId: INVITEE_A,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'pending-remove-one',
              conversationId: INVITEE_A,
            },
          ],
        })}
      </>
    );
  })
  .add('Pending Remove - many', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'pending-remove-many',
              count: 5,
              inviter: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'pending-remove-many',
              count: 5,
              inviter: OUR_ID,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'pending-remove-many',
              count: 5,
              inviter: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'pending-remove-many',
              count: 5,
              inviter: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'pending-remove-many',
              count: 5,
              inviter: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'pending-remove-many',
              count: 5,
              inviter: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'pending-remove-many',
              count: 5,
            },
          ],
        })}

        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'pending-remove-many',
              count: 5,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'pending-remove-many',
              count: 5,
            },
          ],
        })}
      </>
    );
  })
  .add('Admin Approval (Add)', () => {
    return (
      <>
        {renderChange({
          details: [
            {
              type: 'admin-approval-add-one',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'admin-approval-add-one',
              conversationId: CONTACT_A,
            },
          ],
        })}
      </>
    );
  })
  .add('Admin Approval (Remove)', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'admin-approval-remove-one',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'admin-approval-remove-one',
              conversationId: OUR_ID,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'admin-approval-remove-one',
              conversationId: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          from: CONTACT_A,
          details: [
            {
              type: 'admin-approval-remove-one',
              conversationId: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'admin-approval-remove-one',
              conversationId: CONTACT_A,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'admin-approval-remove-one',
              conversationId: CONTACT_A,
            },
          ],
        })}
      </>
    );
  })
  .add('Group Link (Add)', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'group-link-add',
              privilege: AccessControlEnum.ANY,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'group-link-add',
              privilege: AccessControlEnum.ANY,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'group-link-add',
              privilege: AccessControlEnum.ANY,
            },
          ],
        })}
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'group-link-add',
              privilege: AccessControlEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'group-link-add',
              privilege: AccessControlEnum.ADMINISTRATOR,
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'group-link-add',
              privilege: AccessControlEnum.ADMINISTRATOR,
            },
          ],
        })}
      </>
    );
  })
  .add('Group Link (Reset)', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'group-link-reset',
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'group-link-reset',
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'group-link-reset',
            },
          ],
        })}
      </>
    );
  })
  .add('Group Link (Remove)', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              type: 'group-link-remove',
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              type: 'group-link-remove',
            },
          ],
        })}
        {renderChange({
          details: [
            {
              type: 'group-link-remove',
            },
          ],
        })}
      </>
    );
  })
  .add('Description (Remove)', () => {
    return (
      <>
        {renderChange({
          from: OUR_ID,
          details: [
            {
              removed: true,
              type: 'description',
            },
          ],
        })}
        {renderChange({
          from: ADMIN_A,
          details: [
            {
              removed: true,
              type: 'description',
            },
          ],
        })}
        {renderChange({
          details: [
            {
              removed: true,
              type: 'description',
            },
          ],
        })}
      </>
    );
  })
  .add('Description (Change)', () => {
    return (
      <>
        {renderChange(
          {
            from: OUR_ID,
            details: [
              {
                type: 'description',
                description:
                  'This is a long description.\n\nWe need a dialog to view it all!\n\nIt has a link to https://example.com',
              },
            ],
          },
          'We do hikes 🌲'
        )}
        {renderChange(
          {
            from: ADMIN_A,
            details: [
              {
                type: 'description',
                description:
                  'This is a long description.\n\nWe need a dialog to view it all!\n\nIt has a link to https://example.com',
              },
            ],
          },
          'We do hikes 🌲'
        )}
        {renderChange(
          {
            details: [
              {
                type: 'description',
                description:
                  'This is a long description.\n\nWe need a dialog to view it all!\n\nIt has a link to https://example.com',
              },
            ],
          },
          'We do hikes 🌲'
        )}
      </>
    );
  });
