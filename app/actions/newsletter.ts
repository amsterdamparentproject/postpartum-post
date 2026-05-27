"use server";

import { BeehiivClient } from "@beehiiv/sdk";

const apiKey = process.env.BEEHIIV_API_KEY;
const pubId = process.env.BEEHIIV_PUBLICATION_ID;
const isLocal = process.env.NODE_ENV === "development";

export const subscribeToNewsletter = async ({
  email,
  tags,
  referringSite,
}: {
  email: string;
  tags?: string[];
  referringSite?: string;
}) => {
  if (!apiKey || !pubId) {
    console.error("Missing Beehiiv configuration");
    return { success: false, error: "Configuration Error" };
  }

  try {
    const client = new BeehiivClient({ token: apiKey });

    const getTags = (formTags: string[] | undefined) => {
      const baseTags = formTags || [];
      const dateTag = `test-${new Date()
        .toLocaleString("sv-SE")
        .replace(" ", "--")
        .replace(/:/g, "-")
        .slice(0, 17)}`;
      if (isLocal) {
        return [...baseTags, dateTag];
      }
      return baseTags;
    };

    const { data: subscriber } = await client.subscriptions.create(pubId, {
      email,
      referring_site: referringSite,
      utm_source: "direct",
      utm_medium: "website",
    });

    if (subscriber?.id) {
      await client.subscriptionTags.create(pubId, subscriber.id, {
        tags: getTags(tags),
      });
    }

    return { success: true };
  } catch (error) {
    console.error("Beehiiv Error:", error);
    return { success: false, error: (error as Error).message };
  }
};
