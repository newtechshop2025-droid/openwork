/** @jsxImportSource react */
import { useEffect, useState } from "react";
import { Cpu, Loader2, CheckCircle2, XCircle, RefreshCw, Key, Globe } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { registerExtensionConfig, type ExtensionConfigContext } from "./extension-registry";

type RouterModel = {
  id: string;
  name?: string;
};

const routerConfigFactory = (ctx: ExtensionConfigContext) => (
  <RouterConfig
    busy={ctx.localProvider.busy}
    status={ctx.localProvider.status}
    error={ctx.localProvider.error}
    onInstall={ctx.localProvider.onInstall}
  />
);

registerExtensionConfig("openwork.9router.settings", routerConfigFactory);
registerExtensionConfig("9router", routerConfigFactory);

export type RouterConfigProps = {
  busy: boolean;
  status: string | null;
  error: string | null;
  onInstall: (input: {
    providerId: string;
    name: string;
    baseURL: string;
    modelId: string;
    modelName: string;
    setDefault: boolean;
    apiKey?: string;
  }) => void | Promise<void>;
};

export function RouterConfig(props: RouterConfigProps) {
  const [baseURL, setBaseURL] = useState("http://localhost:20128/v1");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<RouterModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [customModelId, setCustomModelId] = useState("");
  const [customModelName, setCustomModelName] = useState("");
  const [useCustomModel, setUseCustomModel] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [setDefault, setSetDefault] = useState(true);

  const fetchModels = async () => {
    setFetchingModels(true);
    setFetchError(null);
    try {
      const cleanUrl = baseURL.trim().replace(/\/$/, "");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey.trim()) {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      }

      const response = await fetch(`${cleanUrl}/models`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(6000),
      });

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const rawList = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      
      const parsedList = rawList.map((m: any) => ({
        id: String(m?.id || m || "").trim(),
        name: String(m?.name || m?.id || m || "").trim(),
      })).filter((m: any) => m.id);

      setModels(parsedList);
      if (parsedList.length > 0) {
        setSelectedModel(parsedList[0].id);
        setUseCustomModel(false);
      } else {
        setUseCustomModel(true);
        setFetchError("No models found from API. Please enter your Model ID manually below.");
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch models. Check URL and API Key.");
      setUseCustomModel(true);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleInstall = () => {
    const finalModelId = useCustomModel ? customModelId.trim() : selectedModel;
    const finalModelName = useCustomModel ? customModelName.trim() || finalModelId : (models.find(m => m.id === selectedModel)?.name || finalModelId);

    if (!finalModelId) {
      return;
    }

    void props.onInstall({
      providerId: "9router",
      name: "9Router",
      baseURL: baseURL.trim(),
      modelId: finalModelId,
      modelName: finalModelName,
      setDefault,
      apiKey: apiKey.trim() || undefined,
    });
  };

  return (
    <Card variant="outline" size="sm" className="shadow-lg border-dls-border/60">
      <CardHeader className="bg-gradient-to-r from-indigo-50/30 to-violet-50/30 dark:from-indigo-950/10 dark:to-violet-950/10">
        <CardTitle className="flex items-center gap-2 text-indigo-11">
          <Cpu className="size-5" />
          9Router Configuration
        </CardTitle>
        <CardDescription>
          Connect to a local or remote 9Router instance to save tokens and route LLM queries.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-5 pt-4">
        {props.error ? (
          <Alert variant="destructive">
            <XCircle className="size-4" />
            <AlertDescription>{props.error}</AlertDescription>
          </Alert>
        ) : null}

        {props.status ? (
          <Alert className="bg-green-1 border-green-3">
            <CheckCircle2 className="size-4 text-green-9" />
            <AlertDescription className="text-green-11">{props.status}</AlertDescription>
          </Alert>
        ) : null}

        <FieldSet className="gap-4">
          {/* Base URL Input */}
          <Field>
            <FieldLabel htmlFor="router-base-url" className="flex items-center gap-1.5 text-xs font-semibold">
              <Globe className="size-3.5 text-indigo-9" />
              API URL (Base URL)
            </FieldLabel>
            <Input
              id="router-base-url"
              type="text"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="http://localhost:20128/v1"
              className="bg-dls-surface border-dls-border/80 focus:border-indigo-9 focus:ring-1 focus:ring-indigo-9"
            />
            <FieldDescription>
              The OpenAI-compatible endpoint of your 9Router service.
            </FieldDescription>
          </Field>

          {/* API Key Input */}
          <Field>
            <FieldLabel htmlFor="router-api-key" className="flex items-center gap-1.5 text-xs font-semibold">
              <Key className="size-3.5 text-indigo-9" />
              API Key (Optional)
            </FieldLabel>
            <Input
              id="router-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Leave blank if not required"
              className="bg-dls-surface border-dls-border/80 focus:border-indigo-9 focus:ring-1 focus:ring-indigo-9"
            />
            <FieldDescription>
              Provide an API Key if your remote 9Router service requires authentication.
            </FieldDescription>
          </Field>
        </FieldSet>

        {/* Model Fetch Area */}
        <div className="flex flex-col gap-3 border-t border-dls-border/40 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-dls-secondary">Model Discovery</span>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchModels}
              disabled={fetchingModels || !baseURL.trim()}
              className="gap-1.5 hover:bg-indigo-50 hover:text-indigo-11 dark:hover:bg-indigo-950/20"
            >
              {fetchingModels ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Fetch Models
            </Button>
          </div>

          {fetchError ? (
            <div className="text-xs text-amber-11 bg-amber-1 px-3 py-2 rounded-lg border border-amber-3">
              {fetchError}
            </div>
          ) : null}

          {/* Model selection from API list */}
          {!useCustomModel && models.length > 0 ? (
            <FieldSet className="gap-2.5">
              <FieldLegend variant="label" className="text-[11px] uppercase tracking-wider text-dls-secondary">
                Available Models ({models.length})
              </FieldLegend>
              <RadioGroup
                className="grid gap-2 grid-cols-1"
                value={selectedModel}
                onValueChange={setSelectedModel}
              >
                {models.map((model) => (
                  <FieldLabel
                    key={model.id}
                    htmlFor={model.id}
                    className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 cursor-pointer transition-all ${
                      selectedModel === model.id
                        ? "border-indigo-9 bg-indigo-2/20 text-indigo-11"
                        : "border-dls-border hover:bg-dls-surface"
                    }`}
                  >
                    <RadioGroupItem value={model.id} id={model.id} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{model.name || model.id}</div>
                      <div className="text-[10px] text-dls-secondary font-mono truncate">{model.id}</div>
                    </div>
                  </FieldLabel>
                ))}
              </RadioGroup>
              <Button
                variant="link"
                size="sm"
                className="self-center text-xs mt-1 text-indigo-10 hover:text-indigo-11"
                onClick={() => setUseCustomModel(true)}
              >
                Enter custom Model ID manually instead
              </Button>
            </FieldSet>
          ) : null}

          {/* Manual Model ID entry */}
          {useCustomModel || models.length === 0 ? (
            <FieldSet className="gap-3 border border-dashed border-dls-border/60 rounded-xl p-3 bg-dls-surface/30">
              <FieldLegend variant="label" className="text-[11px] uppercase tracking-wider text-dls-secondary">
                Custom Model Configuration
              </FieldLegend>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="custom-model-id" className="text-xs">Model ID</FieldLabel>
                  <Input
                    id="custom-model-id"
                    type="text"
                    value={customModelId}
                    onChange={(e) => setCustomModelId(e.target.value)}
                    placeholder="e.g. qwen2.5-coder:7b"
                    className="bg-dls-surface text-xs h-8"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="custom-model-name" className="text-xs">Display Name</FieldLabel>
                  <Input
                    id="custom-model-name"
                    type="text"
                    value={customModelName}
                    onChange={(e) => setCustomModelName(e.target.value)}
                    placeholder="e.g. Qwen Coder"
                    className="bg-dls-surface text-xs h-8"
                  />
                </Field>
              </div>
              {models.length > 0 && (
                <Button
                  variant="link"
                  size="sm"
                  className="self-center text-xs text-indigo-10 hover:text-indigo-11"
                  onClick={() => setUseCustomModel(false)}
                >
                  Back to discovered models
                </Button>
              )}
            </FieldSet>
          ) : null}
        </div>
      </CardContent>

      <CardFooter className="border-t border-dls-border/40 bg-dls-surface/20 flex flex-col items-start gap-4">
        <FieldGroup className="w-full">
          <Field orientation="horizontal" className="gap-2">
            <Checkbox
              id="router-set-default"
              name="router-set-default"
              checked={setDefault}
              onCheckedChange={setSetDefault}
              nativeButton
              render={<button type="button" />}
            />
            <FieldLabel htmlFor="router-set-default" className="text-xs text-dls-secondary cursor-pointer">
              Set as the default model for this workspace
            </FieldLabel>
          </Field>
        </FieldGroup>
        
        <Button
          onClick={handleInstall}
          disabled={
            props.busy ||
            fetchingModels ||
            (useCustomModel ? !customModelId.trim() : !selectedModel)
          }
          className="w-full bg-indigo-9 hover:bg-indigo-10 text-white font-medium gap-1.5 transition-colors shadow-sm"
        >
          {props.busy && <Loader2 className="size-4 animate-spin" />}
          Add to workspace
        </Button>
      </CardFooter>
    </Card>
  );
}
