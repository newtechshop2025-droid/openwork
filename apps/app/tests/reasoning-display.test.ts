import { describe, expect, test, mock } from "bun:test";

mock.module("dompurify", () => {
  return {
    default: {
      sanitize: (val: string) => val,
    },
  };
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "ai";

import { DEFAULT_SHOW_THINKING } from "../src/react-app/kernel/local-provider";
import { AssistantMessage } from "../src/components/chat/message-list";
import { MessageListProvider } from "../src/components/chat/message-list-provider";
import { OpenTargetProvider } from "../src/lib/target-provider";

describe("reasoning display", () => {
  test("defaults reasoning visibility on", () => {
    expect(DEFAULT_SHOW_THINKING).toBe(true);
  });

  test("renders reasoning as prose", () => {
    const messages: UIMessage[] = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "Thinking:\nWe should inspect the settings preference first.",
            state: "done",
          },
        ],
      },
    ];

    const html = renderToStaticMarkup(
      React.createElement(
        MessageListProvider,
        {
          workspaceId: "test",
          sessionId: "test",
          showThinking: true,
          developerMode: false,
          displaySuggestions: false,
          providerConnectedCount: 0,
          dispatchAction: () => {},
          setPrompt: () => {},
          onRevertToUserMessage: () => {},
          onForkAtMessage: () => {},
          children: React.createElement(
            OpenTargetProvider,
            {
              openTargets: [],
              onOpenTarget: () => {},
              children: React.createElement(AssistantMessage, {
                message: messages[0]!,
                isLastMessage: true,
                isStreaming: false,
                isLastStep: true,
              })
            }
          )
        }
      )
    );

    expect(html).toContain("We should inspect the settings preference first.");
  });
});
