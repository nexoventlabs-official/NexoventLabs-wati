/**
 * Self-contained WhatsApp Flow JSON for the Nexovent Labs category picker.
 *
 * This is a NAVIGATE-only flow (no data_exchange endpoint / encryption keys
 * required). The category list is injected at send-time through the flow
 * message's `flow_action_payload.data.categories`, so a single published flow
 * serves whatever categories are active without re-publishing.
 *
 * Screen flow:
 *   CATEGORY_SELECT  --(navigate)-->  CONFIRM (terminal, success)
 *
 * The terminal screen fires `complete` with { selected_category }, which the
 * webhook receives as an `interactive.nfm_reply` and uses to send the chosen
 * category's promo message (image header + body + DEMO CTA).
 */
function buildFlowJSON() {
  return {
    version: '7.0',
    screens: [
      {
        id: 'CATEGORY_SELECT',
        title: 'Our Services',
        terminal: true,
        success: true,
        data: {
          heading: {
            type: 'string',
            __example__: 'What are you interested in?',
          },
          subheading: {
            type: 'string',
            __example__: 'Pick a service and we will share a quick demo.',
          },
          categories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
              },
            },
            __example__: [
              { id: 'cat_1', title: 'WhatsApp Automation', description: 'Automate. Engage. Grow.' },
              { id: 'cat_2', title: 'Chatbot', description: 'Smart automated replies' },
            ],
          },
        },
        layout: {
          type: 'SingleColumnLayout',
          children: [
            { type: 'TextHeading', text: '${data.heading}' },
            { type: 'TextBody', text: '${data.subheading}' },
            {
              type: 'RadioButtonsGroup',
              name: 'selected_category',
              label: 'Services',
              required: true,
              'data-source': '${data.categories}',
            },
            {
              type: 'Footer',
              label: 'Get Demo',
              'on-click-action': {
                name: 'complete',
                payload: {
                  selected_category: '${form.selected_category}',
                },
              },
            },
          ],
        },
      },
    ],
  };
}

module.exports = { buildFlowJSON };
