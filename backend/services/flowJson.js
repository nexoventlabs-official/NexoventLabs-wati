/**
 * Self-contained WhatsApp Flow JSON for the Nexovent Labs category picker.
 *
 * NAVIGATE-only flow (no data_exchange endpoint / encryption keys required).
 * Runtime data (banner + categories, each with a base64 logo) is injected via
 * the flow message's `flow_action_payload.data`, so one published flow serves
 * whatever categories are active without re-publishing.
 *
 * IMPORTANT: the category `image` field and the banner MUST be raw base64
 * (PNG/JPG) - WhatsApp Flows do NOT accept image URLs. That is why logos passed
 * as URLs never showed up. See services/imageBase64.js.
 *
 * Screen: CATEGORY_SELECT (terminal) -> fires `complete` with { selected_category }.
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
          banner: { type: 'string', __example__: 'iVBORw0KGgo' },
          has_banner: { type: 'boolean', __example__: false },
          categories: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                image: { type: 'string' },
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
            {
              type: 'Image',
              src: '${data.banner}',
              width: 1000,
              height: 125,
              'scale-type': 'cover',
              'alt-text': 'Nexovent Labs',
              visible: '${data.has_banner}',
            },
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
