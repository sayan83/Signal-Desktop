// Copyright 2020 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import { FullJSXType } from './components/Intl';
import { LocalizerType } from './types/Util';
import { ReplacementValuesType } from './types/I18N';
import { missingCaseError } from './util/missingCaseError';

import { AccessControlClass, MemberClass } from './textsecure.d';
import { GroupV2ChangeDetailType, GroupV2ChangeType } from './groups';

export type SmartContactRendererType = (conversationId: string) => FullJSXType;
export type StringRendererType = (
  id: string,
  i18n: LocalizerType,
  components?: Array<FullJSXType> | ReplacementValuesType<FullJSXType>
) => FullJSXType;

export type RenderOptionsType = {
  AccessControlEnum: typeof AccessControlClass.AccessRequired;
  from?: string;
  i18n: LocalizerType;
  ourConversationId: string;
  renderContact: SmartContactRendererType;
  renderString: StringRendererType;
  RoleEnum: typeof MemberClass.Role;
};

export function renderChange(
  change: GroupV2ChangeType,
  options: RenderOptionsType
): Array<FullJSXType> {
  const { details, from } = change;

  return details.map((detail: GroupV2ChangeDetailType) =>
    renderChangeDetail(detail, {
      ...options,
      from,
    })
  );
}

export function renderChangeDetail(
  detail: GroupV2ChangeDetailType,
  options: RenderOptionsType
): FullJSXType {
  const {
    AccessControlEnum,
    from,
    i18n,
    ourConversationId,
    renderContact,
    renderString,
    RoleEnum,
  } = options;
  const fromYou = Boolean(from && from === ourConversationId);

  if (detail.type === 'create') {
    if (fromYou) {
      return renderString('GroupV2--create--you', i18n);
    }
    if (from) {
      return renderString('GroupV2--create--other', i18n, {
        memberName: renderContact(from),
      });
    }
    return renderString('GroupV2--create--unknown', i18n);
  }
  if (detail.type === 'title') {
    const { newTitle } = detail;

    if (newTitle) {
      if (fromYou) {
        return renderString('GroupV2--title--change--you', i18n, [newTitle]);
      }
      if (from) {
        return renderString('GroupV2--title--change--other', i18n, {
          memberName: renderContact(from),
          newTitle,
        });
      }
      return renderString('GroupV2--title--change--unknown', i18n, [newTitle]);
    }
    if (fromYou) {
      return renderString('GroupV2--title--remove--you', i18n);
    }
    if (from) {
      return renderString('GroupV2--title--remove--other', i18n, [
        renderContact(from),
      ]);
    }
    return renderString('GroupV2--title--remove--unknown', i18n);
  }
  if (detail.type === 'avatar') {
    if (detail.removed) {
      if (fromYou) {
        return renderString('GroupV2--avatar--remove--you', i18n);
      }
      if (from) {
        return renderString('GroupV2--avatar--remove--other', i18n, [
          renderContact(from),
        ]);
      }
      return renderString('GroupV2--avatar--remove--unknown', i18n);
    }
    if (fromYou) {
      return renderString('GroupV2--avatar--change--you', i18n);
    }
    if (from) {
      return renderString('GroupV2--avatar--change--other', i18n, [
        renderContact(from),
      ]);
    }
    return renderString('GroupV2--avatar--change--unknown', i18n);
  }
  if (detail.type === 'access-attributes') {
    const { newPrivilege } = detail;

    if (newPrivilege === AccessControlEnum.ADMINISTRATOR) {
      if (fromYou) {
        return renderString('GroupV2--access-attributes--admins--you', i18n);
      }
      if (from) {
        return renderString('GroupV2--access-attributes--admins--other', i18n, [
          renderContact(from),
        ]);
      }
      return renderString('GroupV2--access-attributes--admins--unknown', i18n);
    }
    if (newPrivilege === AccessControlEnum.MEMBER) {
      if (fromYou) {
        return renderString('GroupV2--access-attributes--all--you', i18n);
      }
      if (from) {
        return renderString('GroupV2--access-attributes--all--other', i18n, [
          renderContact(from),
        ]);
      }
      return renderString('GroupV2--access-attributes--all--unknown', i18n);
    }
    window.log.warn(
      `access-attributes change type, privilege ${newPrivilege} is unknown`
    );
    return '';
  }
  if (detail.type === 'access-members') {
    const { newPrivilege } = detail;

    if (newPrivilege === AccessControlEnum.ADMINISTRATOR) {
      if (fromYou) {
        return renderString('GroupV2--access-members--admins--you', i18n);
      }
      if (from) {
        return renderString('GroupV2--access-members--admins--other', i18n, [
          renderContact(from),
        ]);
      }
      return renderString('GroupV2--access-members--admins--unknown', i18n);
    }
    if (newPrivilege === AccessControlEnum.MEMBER) {
      if (fromYou) {
        return renderString('GroupV2--access-members--all--you', i18n);
      }
      if (from) {
        return renderString('GroupV2--access-members--all--other', i18n, [
          renderContact(from),
        ]);
      }
      return renderString('GroupV2--access-members--all--unknown', i18n);
    }
    window.log.warn(
      `access-members change type, privilege ${newPrivilege} is unknown`
    );
    return '';
  }
  if (detail.type === 'access-invite-link') {
    const { newPrivilege } = detail;

    if (newPrivilege === AccessControlEnum.ADMINISTRATOR) {
      if (fromYou) {
        return renderString('GroupV2--access-invite-link--enabled--you', i18n);
      }
      if (from) {
        return renderString(
          'GroupV2--access-invite-link--enabled--other',
          i18n,
          [renderContact(from)]
        );
      }
      return renderString(
        'GroupV2--access-invite-link--enabled--unknown',
        i18n
      );
    }
    if (newPrivilege === AccessControlEnum.ANY) {
      if (fromYou) {
        return renderString('GroupV2--access-invite-link--disabled--you', i18n);
      }
      if (from) {
        return renderString(
          'GroupV2--access-invite-link--disabled--other',
          i18n,
          [renderContact(from)]
        );
      }
      return renderString(
        'GroupV2--access-invite-link--disabled--unknown',
        i18n
      );
    }
    window.log.warn(
      `access-invite-link change type, privilege ${newPrivilege} is unknown`
    );
    return '';
  }
  if (detail.type === 'member-add') {
    const { conversationId } = detail;
    const weAreJoiner = conversationId === ourConversationId;

    if (weAreJoiner) {
      if (fromYou) {
        return renderString('GroupV2--member-add--you--you', i18n);
      }
      if (from) {
        return renderString('GroupV2--member-add--you--other', i18n, [
          renderContact(from),
        ]);
      }
      return renderString('GroupV2--member-add--you--unknown', i18n);
    }
    if (fromYou) {
      return renderString('GroupV2--member-add--other--you', i18n, [
        renderContact(conversationId),
      ]);
    }
    if (from) {
      return renderString('GroupV2--member-add--other--other', i18n, {
        adderName: renderContact(from),
        addeeName: renderContact(conversationId),
      });
    }
    return renderString('GroupV2--member-add--other--unknown', i18n, [
      renderContact(conversationId),
    ]);
  }
  if (detail.type === 'member-add-from-invite') {
    const { conversationId, inviter } = detail;
    const weAreJoiner = conversationId === ourConversationId;
    const weAreInviter = Boolean(inviter && inviter === ourConversationId);

    if (!from || from !== conversationId) {
      if (weAreJoiner) {
        // They can't be the same, no fromYou check here
        if (from) {
          return renderString('GroupV2--member-add--you--other', i18n, [
            renderContact(from),
          ]);
        }
        return renderString('GroupV2--member-add--you--unknown', i18n);
      }

      if (fromYou) {
        return renderString('GroupV2--member-add--invited--you', i18n, {
          inviteeName: renderContact(conversationId),
        });
      }
      if (from) {
        return renderString('GroupV2--member-add--invited--other', i18n, {
          memberName: renderContact(from),
          inviteeName: renderContact(conversationId),
        });
      }
      return renderString('GroupV2--member-add--invited--unknown', i18n, {
        inviteeName: renderContact(conversationId),
      });
    }

    if (weAreJoiner) {
      if (inviter) {
        return renderString('GroupV2--member-add--from-invite--you', i18n, [
          renderContact(inviter),
        ]);
      }
      return renderString(
        'GroupV2--member-add--from-invite--you-no-from',
        i18n
      );
    }
    if (weAreInviter) {
      return renderString('GroupV2--member-add--from-invite--from-you', i18n, [
        renderContact(conversationId),
      ]);
    }
    if (inviter) {
      return renderString('GroupV2--member-add--from-invite--other', i18n, {
        inviteeName: renderContact(conversationId),
        inviterName: renderContact(inviter),
      });
    }
    return renderString(
      'GroupV2--member-add--from-invite--other-no-from',
      i18n,
      {
        inviteeName: renderContact(conversationId),
      }
    );
  }
  if (detail.type === 'member-add-from-link') {
    const { conversationId } = detail;

    if (fromYou && conversationId === ourConversationId) {
      return renderString('GroupV2--member-add-from-link--you--you', i18n);
    }
    if (from && conversationId === from) {
      return renderString('GroupV2--member-add-from-link--other', i18n, [
        renderContact(from),
      ]);
    }

    // Note: this shouldn't happen, because we only capture 'add-from-link' status
    //   from group change events, which always have a sender.
    window.log.warn('member-add-from-link change type; we have no from!');
    return renderString('GroupV2--member-add--other--unknown', i18n, [
      renderContact(conversationId),
    ]);
  }
  if (detail.type === 'member-add-from-admin-approval') {
    const { conversationId } = detail;
    const weAreJoiner = conversationId === ourConversationId;

    if (weAreJoiner) {
      if (from) {
        return renderString(
          'GroupV2--member-add-from-admin-approval--you--other',
          i18n,
          [renderContact(from)]
        );
      }

      // Note: this shouldn't happen, because we only capture 'add-from-admin-approval'
      //   status from group change events, which always have a sender.
      window.log.warn(
        'member-add-from-admin-approval change type; we have no from, and we are joiner!'
      );
      return renderString(
        'GroupV2--member-add-from-admin-approval--you--unknown',
        i18n
      );
    }

    if (fromYou) {
      return renderString(
        'GroupV2--member-add-from-admin-approval--other--you',
        i18n,
        [renderContact(conversationId)]
      );
    }
    if (from) {
      return renderString(
        'GroupV2--member-add-from-admin-approval--other--other',
        i18n,
        {
          adminName: renderContact(from),
          joinerName: renderContact(conversationId),
        }
      );
    }

    // Note: this shouldn't happen, because we only capture 'add-from-admin-approval'
    //   status from group change events, which always have a sender.
    window.log.warn(
      'member-add-from-admin-approval change type; we have no from'
    );
    return renderString(
      'GroupV2--member-add-from-admin-approval--other--unknown',
      i18n,
      [renderContact(conversationId)]
    );
  }
  if (detail.type === 'member-remove') {
    const { conversationId } = detail;
    const weAreLeaver = conversationId === ourConversationId;

    if (weAreLeaver) {
      if (fromYou) {
        return renderString('GroupV2--member-remove--you--you', i18n);
      }
      if (from) {
        return renderString('GroupV2--member-remove--you--other', i18n, [
          renderContact(from),
        ]);
      }
      return renderString('GroupV2--member-remove--you--unknown', i18n);
    }

    if (fromYou) {
      return renderString('GroupV2--member-remove--other--you', i18n, [
        renderContact(conversationId),
      ]);
    }
    if (from && from === conversationId) {
      return renderString('GroupV2--member-remove--other--self', i18n, [
        renderContact(from),
      ]);
    }
    if (from) {
      return renderString('GroupV2--member-remove--other--other', i18n, {
        adminName: renderContact(from),
        memberName: renderContact(conversationId),
      });
    }
    return renderString('GroupV2--member-remove--other--unknown', i18n, [
      renderContact(conversationId),
    ]);
  }
  if (detail.type === 'member-privilege') {
    const { conversationId, newPrivilege } = detail;
    const weAreMember = conversationId === ourConversationId;

    if (newPrivilege === RoleEnum.ADMINISTRATOR) {
      if (weAreMember) {
        if (from) {
          return renderString(
            'GroupV2--member-privilege--promote--you--other',
            i18n,
            [renderContact(from)]
          );
        }

        return renderString(
          'GroupV2--member-privilege--promote--you--unknown',
          i18n
        );
      }

      if (fromYou) {
        return renderString(
          'GroupV2--member-privilege--promote--other--you',
          i18n,
          [renderContact(conversationId)]
        );
      }
      if (from) {
        return renderString(
          'GroupV2--member-privilege--promote--other--other',
          i18n,
          {
            adminName: renderContact(from),
            memberName: renderContact(conversationId),
          }
        );
      }
      return renderString(
        'GroupV2--member-privilege--promote--other--unknown',
        i18n,
        [renderContact(conversationId)]
      );
    }
    if (newPrivilege === RoleEnum.DEFAULT) {
      if (weAreMember) {
        if (from) {
          return renderString(
            'GroupV2--member-privilege--demote--you--other',
            i18n,
            [renderContact(from)]
          );
        }
        return renderString(
          'GroupV2--member-privilege--demote--you--unknown',
          i18n
        );
      }

      if (fromYou) {
        return renderString(
          'GroupV2--member-privilege--demote--other--you',
          i18n,
          [renderContact(conversationId)]
        );
      }
      if (from) {
        return renderString(
          'GroupV2--member-privilege--demote--other--other',
          i18n,
          {
            adminName: renderContact(from),
            memberName: renderContact(conversationId),
          }
        );
      }
      return renderString(
        'GroupV2--member-privilege--demote--other--unknown',
        i18n,
        [renderContact(conversationId)]
      );
    }
    window.log.warn(
      `member-privilege change type, privilege ${newPrivilege} is unknown`
    );
    return '';
  }
  if (detail.type === 'pending-add-one') {
    const { conversationId } = detail;
    const weAreInvited = conversationId === ourConversationId;
    if (weAreInvited) {
      if (from) {
        return renderString('GroupV2--pending-add--one--you--other', i18n, [
          renderContact(from),
        ]);
      }
      return renderString('GroupV2--pending-add--one--you--unknown', i18n);
    }
    if (fromYou) {
      return renderString('GroupV2--pending-add--one--other--you', i18n, [
        renderContact(conversationId),
      ]);
    }
    if (from) {
      return renderString('GroupV2--pending-add--one--other--other', i18n, [
        renderContact(from),
      ]);
    }
    return renderString('GroupV2--pending-add--one--other--unknown', i18n);
  }
  if (detail.type === 'pending-add-many') {
    const { count } = detail;

    if (fromYou) {
      return renderString('GroupV2--pending-add--many--you', i18n, [
        count.toString(),
      ]);
    }
    if (from) {
      return renderString('GroupV2--pending-add--many--other', i18n, {
        memberName: renderContact(from),
        count: count.toString(),
      });
    }
    return renderString('GroupV2--pending-add--many--unknown', i18n, [
      count.toString(),
    ]);
  }
  if (detail.type === 'pending-remove-one') {
    const { inviter, conversationId } = detail;
    const weAreInviter = Boolean(inviter && inviter === ourConversationId);
    const weAreInvited = conversationId === ourConversationId;
    const sentByInvited = Boolean(from && from === conversationId);
    const sentByInviter = Boolean(from && inviter && from === inviter);

    if (weAreInviter) {
      if (sentByInvited) {
        return renderString('GroupV2--pending-remove--decline--you', i18n, [
          renderContact(conversationId),
        ]);
      }
      if (fromYou) {
        return renderString(
          'GroupV2--pending-remove--revoke-invite-from-you--one--you',
          i18n,
          [renderContact(conversationId)]
        );
      }
      if (from) {
        return renderString(
          'GroupV2--pending-remove--revoke-invite-from-you--one--other',
          i18n,
          {
            adminName: renderContact(from),
            inviteeName: renderContact(conversationId),
          }
        );
      }
      return renderString(
        'GroupV2--pending-remove--revoke-invite-from-you--one--unknown',
        i18n,
        [renderContact(conversationId)]
      );
    }
    if (sentByInvited) {
      if (fromYou) {
        return renderString('GroupV2--pending-remove--decline--from-you', i18n);
      }
      if (inviter) {
        return renderString('GroupV2--pending-remove--decline--other', i18n, [
          renderContact(inviter),
        ]);
      }
      return renderString('GroupV2--pending-remove--decline--unknown', i18n);
    }
    if (inviter && sentByInviter) {
      if (weAreInvited) {
        return renderString(
          'GroupV2--pending-remove--revoke-own--to-you',
          i18n,
          [renderContact(inviter)]
        );
      }
      return renderString(
        'GroupV2--pending-remove--revoke-own--unknown',
        i18n,
        [renderContact(inviter)]
      );
    }
    if (inviter) {
      if (fromYou) {
        return renderString(
          'GroupV2--pending-remove--revoke-invite-from--one--you',
          i18n,
          [renderContact(inviter)]
        );
      }
      if (from) {
        return renderString(
          'GroupV2--pending-remove--revoke-invite-from--one--other',
          i18n,
          {
            adminName: renderContact(from),
            memberName: renderContact(inviter),
          }
        );
      }
      return renderString(
        'GroupV2--pending-remove--revoke-invite-from--one--unknown',
        i18n,
        [renderContact(inviter)]
      );
    }
    if (fromYou) {
      return renderString('GroupV2--pending-remove--revoke--one--you', i18n);
    }
    if (from) {
      return renderString('GroupV2--pending-remove--revoke--one--other', i18n, [
        renderContact(from),
      ]);
    }
    return renderString('GroupV2--pending-remove--revoke--one--unknown', i18n);
  }
  if (detail.type === 'pending-remove-many') {
    const { count, inviter } = detail;
    const weAreInviter = Boolean(inviter && inviter === ourConversationId);

    if (weAreInviter) {
      if (fromYou) {
        return renderString(
          'GroupV2--pending-remove--revoke-invite-from-you--many--you',
          i18n,
          [count.toString()]
        );
      }
      if (from) {
        return renderString(
          'GroupV2--pending-remove--revoke-invite-from-you--many--other',
          i18n,
          {
            adminName: renderContact(from),
            count: count.toString(),
          }
        );
      }
      return renderString(
        'GroupV2--pending-remove--revoke-invite-from-you--many--unknown',
        i18n,
        [count.toString()]
      );
    }
    if (inviter) {
      if (fromYou) {
        return renderString(
          'GroupV2--pending-remove--revoke-invite-from--many--you',
          i18n,
          {
            count: count.toString(),
            memberName: renderContact(inviter),
          }
        );
      }
      if (from) {
        return renderString(
          'GroupV2--pending-remove--revoke-invite-from--many--other',
          i18n,
          {
            adminName: renderContact(from),
            count: count.toString(),
            memberName: renderContact(inviter),
          }
        );
      }
      return renderString(
        'GroupV2--pending-remove--revoke-invite-from--many--unknown',
        i18n,
        {
          count: count.toString(),
          memberName: renderContact(inviter),
        }
      );
    }
    if (fromYou) {
      return renderString('GroupV2--pending-remove--revoke--many--you', i18n, [
        count.toString(),
      ]);
    }
    if (from) {
      return renderString(
        'GroupV2--pending-remove--revoke--many--other',
        i18n,
        {
          memberName: renderContact(from),
          count: count.toString(),
        }
      );
    }
    return renderString(
      'GroupV2--pending-remove--revoke--many--unknown',
      i18n,
      [count.toString()]
    );
  }
  if (detail.type === 'admin-approval-add-one') {
    const { conversationId } = detail;
    const weAreJoiner = conversationId === ourConversationId;

    if (weAreJoiner) {
      return renderString('GroupV2--admin-approval-add-one--you', i18n);
    }
    return renderString('GroupV2--admin-approval-add-one--other', i18n, [
      renderContact(conversationId),
    ]);
  }
  if (detail.type === 'admin-approval-remove-one') {
    const { conversationId } = detail;
    const weAreJoiner = conversationId === ourConversationId;

    if (weAreJoiner) {
      if (fromYou) {
        return renderString(
          'GroupV2--admin-approval-remove-one--you--you',
          i18n
        );
      }
      return renderString(
        'GroupV2--admin-approval-remove-one--you--unknown',
        i18n
      );
    }

    if (fromYou) {
      return renderString(
        'GroupV2--admin-approval-remove-one--other--you',
        i18n,
        [renderContact(conversationId)]
      );
    }
    if (from && from === conversationId) {
      return renderString(
        'GroupV2--admin-approval-remove-one--other--own',
        i18n,
        [renderContact(conversationId)]
      );
    }
    if (from) {
      return renderString(
        'GroupV2--admin-approval-remove-one--other--other',
        i18n,
        {
          adminName: renderContact(from),
          joinerName: renderContact(conversationId),
        }
      );
    }

    // We default to the user canceling their request, because it is far more likely that
    //   if an admin does the denial, we'll get a change event from them.
    return renderString(
      'GroupV2--admin-approval-remove-one--other--own',
      i18n,
      [renderContact(conversationId)]
    );
  }
  if (detail.type === 'group-link-add') {
    const { privilege } = detail;

    if (privilege === AccessControlEnum.ADMINISTRATOR) {
      if (fromYou) {
        return renderString('GroupV2--group-link-add--enabled--you', i18n);
      }
      if (from) {
        return renderString('GroupV2--group-link-add--enabled--other', i18n, [
          renderContact(from),
        ]);
      }
      return renderString('GroupV2--group-link-add--enabled--unknown', i18n);
    }
    if (privilege === AccessControlEnum.ANY) {
      if (fromYou) {
        return renderString('GroupV2--group-link-add--disabled--you', i18n);
      }
      if (from) {
        return renderString('GroupV2--group-link-add--disabled--other', i18n, [
          renderContact(from),
        ]);
      }
      return renderString('GroupV2--group-link-add--disabled--unknown', i18n);
    }
    window.log.warn(
      `group-link-add change type, privilege ${privilege} is unknown`
    );
    return '';
  }
  if (detail.type === 'group-link-reset') {
    if (fromYou) {
      return renderString('GroupV2--group-link-reset--you', i18n);
    }
    if (from) {
      return renderString('GroupV2--group-link-reset--other', i18n, [
        renderContact(from),
      ]);
    }
    return renderString('GroupV2--group-link-reset--unknown', i18n);
  }
  if (detail.type === 'group-link-remove') {
    if (fromYou) {
      return renderString('GroupV2--group-link-remove--you', i18n);
    }
    if (from) {
      return renderString('GroupV2--group-link-remove--other', i18n, [
        renderContact(from),
      ]);
    }
    return renderString('GroupV2--group-link-remove--unknown', i18n);
  }
  if (detail.type === 'description') {
    if (detail.removed) {
      if (fromYou) {
        return renderString('GroupV2--description--remove--you', i18n);
      }
      if (from) {
        return renderString('GroupV2--description--remove--other', i18n, [
          renderContact(from),
        ]);
      }
      return renderString('GroupV2--description--remove--unknown', i18n);
    }

    if (fromYou) {
      return renderString('GroupV2--description--change--you', i18n);
    }
    if (from) {
      return renderString('GroupV2--description--change--other', i18n, [
        renderContact(from),
      ]);
    }
    return renderString('GroupV2--description--change--unknown', i18n);
  }

  throw missingCaseError(detail);
}
