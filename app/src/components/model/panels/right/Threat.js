import {
  Circle as CircleIcon,
  ClearRounded as ClearRoundedIcon,
} from "@mui/icons-material";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import {
  Box,
  Card,
  CardContent,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCreateControlMutation } from "../../../../api/gram/controls";
import {
  useCreateMitigationMutation,
  useListMitigationsQuery,
} from "../../../../api/gram/mitigations";

import {
  useAcceptSuggestionMutation,
  useListSuggestionsQuery,
} from "../../../../api/gram/suggestions";
import {
  useDeleteThreatMutation,
  useUpdateThreatMutation,
} from "../../../../api/gram/threats";
import { useReadOnly } from "../../../../hooks/useReadOnly";
import { CollapsePaper } from "../../../elements/CollapsePaper";
import { useComponentControls } from "../../hooks/useComponentControls";
import { useModelID } from "../../hooks/useModelID";
import { useSelectedComponent } from "../../hooks/useSelectedComponent";
import { SeveritySlider } from "../../modals/SeveritySlider";
import { EditableSelect } from "./EditableSelect";
import { EditableTypography } from "./EditableTypography";
import { MitigationChip } from "./MitigationChip";

export function Threat({
  threat,
  scrollToId,
  selected,
  hideDelete,
  hideAddControl,
  hideSeverityDescription,
}) {
  const modelId = useModelID();
  const selectedComponent = useSelectedComponent();
  const [deleteThreat] = useDeleteThreatMutation();
  const [updateThreat] = useUpdateThreatMutation();
  const [createControl] = useCreateControlMutation();
  const [createMitigation] = useCreateMitigationMutation();
  const [acceptSuggestion] = useAcceptSuggestionMutation();

  const partialThreatId = threat?.suggestionId
    ? threat.suggestionId.split("/").splice(1).join("/")
    : "";
  const { data: suggestions } = useListSuggestionsQuery(modelId);

  const controlSuggestions = (
    suggestions?.controlsMap[selectedComponent?.id] || []
  ).filter(
    (s) =>
      partialThreatId &&
      s.status === "new" &&
      s.mitigates.find((m) => m.partialThreatId === partialThreatId)
  );

  const controls = useComponentControls(threat.componentId);
  const { data: mitigations } = useListMitigationsQuery({ modelId });
  const threatsMap = mitigations?.threatsMap || {};

  const readOnly = useReadOnly();

  const linkedControls = controls.filter((c) =>
    threatsMap[threat.id]?.includes(c.id)
  );

  function createControlWithMitigation(title) {
    createControl({
      modelId: threat.modelId,
      control: {
        title,
        componentId: threat.componentId,
        threatIds: [threat.id],
      },
    });
  }

  function onSelectExisting(control) {
    if (control.mitigates) {
      acceptSuggestion({
        modelId: modelId,
        suggestionId: control.id,
      });
    } else {
      createMitigation({
        modelId: threat.modelId,
        threatId: threat.id,
        controlId: control.id,
      });
    }
  }

  const controlIds = threatsMap[threat.id];
  let mitigated = null;
  if (
    controlIds?.length > 0 &&
    controls?.reduce(
      (p, c) => (controlIds.includes(c.id) ? c.inPlace && p : p),
      true
    )
  ) {
    mitigated = true;
  } else if (controlIds?.length > 0) {
    mitigated = false;
  }

  const threatColor =
    mitigated === true ? "success" : mitigated === false ? "warning" : "error";

  return (
    <Card
      elevation={2}
      sx={{
        flexShrink: 0,
        border: 2,
        ...(selected
          ? {
              borderColor: (theme) => theme.palette.common.klarnaPink,
            }
          : {
              borderColor: "transparent",
            }),
      }}
    >
      <CardContent
        sx={{
          padding: "8px",
          ...(readOnly
            ? { paddingBottom: "8px !important" }
            : { paddingBottom: "16px !important" }),
        }}
      >
        <Box sx={{ display: "flex" }}>
          <Box sx={{ flexGrow: "1" }}>
            <Box display="flex" alignItems="center" gap="5px">
              <CircleIcon
                sx={{
                  fontSize: 15,
                }}
                color={threatColor}
              />
              <Tooltip title="Mark as action item">
                <IconButton
                  onClick={() =>
                    updateThreat({
                      id: threat.id,
                      modelId: threat.modelId,
                      isActionItem: !threat.isActionItem,
                      severity: threat.severity || "low",
                    })
                  }
                  disabled={readOnly}
                >
                  <AssignmentTurnedInIcon
                    sx={{
                      fontSize: 20,
                      color: threat.isActionItem ? "#fff" : "#666",
                    }}
                  />
                </IconButton>
              </Tooltip>
              <EditableTypography
                text={threat.title}
                placeholder="Title"
                variant="body1"
                color="text.primary"
                onSubmit={(v) =>
                  updateThreat({
                    modelId: threat.modelId,
                    id: threat.id,
                    title: v,
                  })
                }
                readOnly={readOnly}
                sx={{
                  lineHeight: "1.4",
                  fontSize: "1.0rem",
                }}
              />

              {!readOnly && !hideDelete && (
                <Tooltip title="Delete Threat">
                  <IconButton
                    onClick={() =>
                      deleteThreat({ modelId: threat.modelId, id: threat.id })
                    }
                    sx={{ marginLeft: "auto", alignSelf: "flex-start" }}
                  >
                    <ClearRoundedIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
            <EditableTypography
              text={threat.description}
              placeholder={
                readOnly
                  ? "No description provided."
                  : "Add description (optional)"
              }
              variant="body1"
              color={threat.description ? "text.secondary" : "text.disabled"}
              onSubmit={(v) =>
                updateThreat({
                  modelId: threat.modelId,
                  id: threat.id,
                  description: v,
                })
              }
              readOnly={readOnly}
              sx={{
                paddingBottom: "10px",
                lineHeight: "1.45",
                fontSize: "0.75rem",
              }}
            />
          </Box>
        </Box>
        {linkedControls.length > 0 && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-start",
              flexWrap: "wrap",
              gap: "5px",
              paddingTop: "0",
              paddingBottom: "10px",
            }}
            component="ul"
          >
            {linkedControls.map((c) => (
              <MitigationChip
                threatId={threat.id}
                modelId={threat.modelId}
                controlId={c.id}
                title={c.title}
                inPlace={c.inPlace}
                key={c.id}
                isControl={true}
                scrollToId={scrollToId}
                readOnly={readOnly}
              />
            ))}
          </Box>
        )}

        {!readOnly && !hideAddControl && (
          <EditableSelect
            placeholder="Add Control"
            options={[
              ...controlSuggestions,
              ...controls.filter(
                (c) => !linkedControls.map((l) => l.id).includes(c.id)
              ),
            ]}
            selectExisting={onSelectExisting}
            createNew={createControlWithMitigation}
          />
        )}

        {threat.isActionItem && (
          <CollapsePaper
            title={"Assessment"}
            defaultExpanded={true}
            sx={{ marginTop: "10px" }}
          >
            <Stack spacing={1} sx={{ padding: "5px" }}>
              <Paper elevation={24} sx={{ padding: "5px" }}>
                <Typography variant="caption">Severity</Typography>
                <SeveritySlider
                  hideDescription={hideSeverityDescription}
                  onChange={(v) => {
                    updateThreat({
                      modelId: threat.modelId,
                      id: threat.id,
                      severity: v,
                    });
                  }}
                  disabled={readOnly}
                  severity={threat.severity}
                  valueLabelDisplay="off"
                />
              </Paper>
            </Stack>
          </CollapsePaper>
        )}
      </CardContent>
    </Card>
  );
}
