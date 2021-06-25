// Copyright 2020-2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* global
  Backbone,
  Whisper,
  MessageController,
  ConversationController
*/

/* eslint-disable more/no-then */

// eslint-disable-next-line func-names
(function () {
  window.Whisper = window.Whisper || {};
  Whisper.Reactions = new (Backbone.Collection.extend({
    forMessage(message) {
      if (message.isOutgoing()) {
        const outgoingReactions = this.filter({
          targetTimestamp: message.get('sent_at'),
        });

        if (outgoingReactions.length > 0) {
          window.log.info('Found early reaction for outgoing message');
          this.remove(outgoingReactions);
          return outgoingReactions;
        }
      }

      const senderId = message.getContactId();
      const sentAt = message.get('sent_at');
      const reactionsBySource = this.filter(re => {
        const targetSenderId = ConversationController.ensureContactIds({
          uuid: re.get('targetAuthorUuid'),
        });
        const targetTimestamp = re.get('targetTimestamp');
        return targetSenderId === senderId && targetTimestamp === sentAt;
      });

      if (reactionsBySource.length > 0) {
        window.log.info('Found early reaction for message');
        this.remove(reactionsBySource);
        return reactionsBySource;
      }

      return [];
    },
    async onReaction(reaction) {
      try {
        // The conversation the target message was in; we have to find it in the database
        //   to to figure that out.
        const targetConversation = await ConversationController.getConversationForTargetMessage(
          ConversationController.ensureContactIds({
            uuid: reaction.get('targetAuthorUuid'),
          }),
          reaction.get('targetTimestamp')
        );
        if (!targetConversation) {
          window.log.info(
            'No target conversation for reaction',
            reaction.get('targetAuthorUuid'),
            reaction.get('targetTimestamp')
          );
          return undefined;
        }

        // awaiting is safe since `onReaction` is never called from inside the queue
        return await targetConversation.queueJob(
          'Reactions.onReaction',
          async () => {
            window.log.info(
              'Handling reaction for',
              reaction.get('targetTimestamp')
            );

            const messages = await window.Signal.Data.getMessagesBySentAt(
              reaction.get('targetTimestamp'),
              {
                MessageCollection: Whisper.MessageCollection,
              }
            );
            // Message is fetched inside the conversation queue so we have the
            // most recent data
            const targetMessage = messages.find(m => {
              const contact = m.getContact();

              if (!contact) {
                return false;
              }

              const mcid = contact.get('id');
              const recid = ConversationController.ensureContactIds({
                uuid: reaction.get('targetAuthorUuid'),
              });
              return mcid === recid;
            });

            if (!targetMessage) {
              window.log.info(
                'No message for reaction',
                reaction.get('targetAuthorUuid'),
                reaction.get('targetTimestamp')
              );

              // Since we haven't received the message for which we are removing a
              // reaction, we can just remove those pending reactions
              if (reaction.get('remove')) {
                this.remove(reaction);
                const oldReaction = this.where({
                  targetAuthorUuid: reaction.get('targetAuthorUuid'),
                  targetTimestamp: reaction.get('targetTimestamp'),
                  emoji: reaction.get('emoji'),
                });
                oldReaction.forEach(r => this.remove(r));
              }

              return undefined;
            }

            const message = MessageController.register(
              targetMessage.id,
              targetMessage
            );

            const oldReaction = await message.handleReaction(reaction);

            this.remove(reaction);

            return oldReaction;
          }
        );
      } catch (error) {
        window.log.error(
          'Reactions.onReaction error:',
          error && error.stack ? error.stack : error
        );
        return undefined;
      }
    },
  }))();
})();
