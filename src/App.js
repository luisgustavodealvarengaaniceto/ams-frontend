import React, { useState } from "react";
import {
  Container,
  TextField,
  Button,
  Paper,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  Slider,
  LinearProgress,
  CircularProgress,
  ThemeProvider,
  createTheme,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Grid,
} from "@mui/material";
import axios from "axios";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import CloseIcon from "@mui/icons-material/Close";

dayjs.extend(utc);
dayjs.extend(timezone);

// Criando tema personalizado em tons de azul
const theme = createTheme({
  palette: {
    primary: {
      main: "#1976d2",
      light: "#42a5f5",
      dark: "#1565c0",
    },
    secondary: {
      main: "#2196f3",
      light: "#64b5f6",
      dark: "#1976d2",
    },
    background: {
      default: "#f5f9ff",
      paper: "#ffffff",
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
        },
      },
    },
  },
});

function App() {
  const [imeis, setImeis] = useState("");
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [imeiCount, setImeiCount] = useState(0);
  const [errorImeis, setErrorImeis] = useState([]);
  const [maxDaysOffline, setMaxDaysOffline] = useState(30);
  const [filteredDevices, setFilteredDevices] = useState([]);
  const [selectedTab, setSelectedTab] = useState("online");
  const [progress, setProgress] = useState(0);
  const [maxOfflineDays, setMaxOfflineDays] = useState(0);
  const [processingStatus, setProcessingStatus] = useState("");
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deviceDetailsMap, setDeviceDetailsMap] = useState({});
  const [showRawJson, setShowRawJson] = useState(false);
  const [rawDeviceData, setRawDeviceData] = useState(null);

  const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:3001";

  const handleImeiChange = (e) => {
    const value = e.target.value;
    setImeis(value);

    // Conta quantos IMEIs foram inseridos
    const imeiList = value
      .split(/[\n,]/)
      .map((imei) => imei.trim())
      .filter((imei) => imei.length > 0);
    setImeiCount(imeiList.length);
  };

  const getBrasiliaTime = (dateString) => {
    if (!dateString) return "";
    return dayjs
      .utc(dateString)
      .tz("America/Sao_Paulo")
      .format("YYYY-MM-DD HH:mm:ss");
  };

  const getChinaTime = (dateString) => {
    if (!dateString) return "";
    return dayjs
      .utc(dateString)
      .tz("Asia/Shanghai")
      .format("YYYY-MM-DD HH:mm:ss");
  };

  const handleMaxDaysChange = (event, newValue) => {
    setMaxDaysOffline(newValue);
    filterDevices(devices, newValue);
  };

  const filterDevices = (devicesList, maxDays) => {
    const filtered = devicesList.map((device) => {
      // Se o dispositivo estiver offline e fora do limite, move para observação
      if (device.daysOffline > maxDays) {
        return { ...device, status: "observacao" };
      }
      return device;
    });
    setFilteredDevices(filtered);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setErrorImeis([]);
    setProgress(0);
    setProcessingStatus("Iniciando processamento...");

    try {
      const imeiList = imeis
        .split(/[\n,]/)
        .map((imei) => imei.trim())
        .filter((imei) => imei.length > 0);

      if (imeiList.length === 0) {
        throw new Error("Por favor, insira pelo menos um IMEI");
      }

      const invalidImeis = imeiList.filter((imei) => !/^\d{15}$/.test(imei));
      if (invalidImeis.length > 0) {
        throw new Error(
          `IMEIs inválidos: ${invalidImeis.join(
            ", "
          )}. O IMEI deve conter 15 dígitos.`
        );
      }

      setProcessingStatus(
        `Iniciando verificação de ${imeiList.length} IMEIs...`
      );
      setProgress(5);

      const response = await axios.post(
        `${apiUrl}/api/check-devices`,
        {
          imeis: imeiList,
        },
        {
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setProgress(5 + percentCompleted * 0.15);
          },
          onDownloadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            const processedImeis = Math.round(
              (percentCompleted * imeiList.length) / 100
            );
            const remainingImeis = imeiList.length - processedImeis;
            setProgress(20 + percentCompleted * 0.75);
            setProcessingStatus(
              `Processando: ${remainingImeis} IMEIs restantes de ${imeiList.length} enviados`
            );
          },
        }
      );

      setProcessingStatus("Processando resultados finais...");
      setProgress(95);

      // Usa os dados processados para a tabela
      handleApiResponse(response.data.devices);

      // Calcula o máximo de dias offline e atualiza o slider
      const maxDays = calculateMaxOfflineDays(response.data.devices);
      setMaxDaysOffline(maxDays);

      setProcessingStatus("Concluído!");
      setProgress(100);

      // Remove a mensagem de conclusão após 2 segundos
      setTimeout(() => {
        setProcessingStatus("");
      }, 2000);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.message ||
          "Erro ao processar requisição"
      );
      setProcessingStatus("Erro no processamento");
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const generateExcel = () => {
    // Preparar dados para o Excel
    const workbook = XLSX.utils.book_new();

    // Separar dispositivos por status
    const onlineDevices = filteredDevices.filter((d) => d.daysOffline === 0);
    const observacaoDevices = filteredDevices.filter(
      (d) => d.daysOffline === 1 || d.daysOffline === 2
    );
    const offlineDevices = filteredDevices.filter(
      (d) =>
        d.daysOffline > 2 &&
        d.daysOffline <= maxDaysOffline &&
        d.status !== "observacao"
    );
    const movidoObsDevices = filteredDevices.filter(
      (d) => d.status === "observacao"
    );

    // Função para mapear os dados para exportação
    const mapDevice = (device) => ({
      IMEI: device.imei,
      "Horário Original": device.lastTime,
      "Horário Brasília": getBrasiliaTime(device.lastTime),
      "Dias Offline": device.daysOffline,
      Status:
        device.daysOffline === 0
          ? "Online"
          : device.daysOffline <= 2
          ? "Em Observação"
          : device.status === "observacao"
          ? "Movido para Observação"
          : "Offline",
    });

    // Criar planilhas para cada status
    const onlineSheet = XLSX.utils.json_to_sheet(onlineDevices.map(mapDevice));
    const observacaoSheet = XLSX.utils.json_to_sheet(
      observacaoDevices.map(mapDevice)
    );
    const offlineSheet = XLSX.utils.json_to_sheet(
      offlineDevices.map(mapDevice)
    );
    const movidoObsSheet = XLSX.utils.json_to_sheet(
      movidoObsDevices.map(mapDevice)
    );
    const notFoundSheet = XLSX.utils.json_to_sheet(
      errorImeis.map((imei) => ({ IMEI: imei, Status: "Não encontrado" }))
    );

    // Adicionar planilhas ao workbook
    XLSX.utils.book_append_sheet(workbook, onlineSheet, "Online");
    XLSX.utils.book_append_sheet(workbook, observacaoSheet, "Em Observação");
    XLSX.utils.book_append_sheet(workbook, offlineSheet, "Offline");
    XLSX.utils.book_append_sheet(
      workbook,
      movidoObsSheet,
      "Movido para Observação"
    );
    XLSX.utils.book_append_sheet(workbook, notFoundSheet, "Não Encontrados");

    // Ajustar largura das colunas
    const wscols = [
      { wch: 20 }, // IMEI
      { wch: 25 }, // Horários
      { wch: 15 }, // Dias Offline
      { wch: 25 }, // Status
    ];
    [
      onlineSheet,
      observacaoSheet,
      offlineSheet,
      movidoObsSheet,
      notFoundSheet,
    ].forEach((sheet) => {
      sheet["!cols"] = wscols;
    });

    // Gerar arquivo Excel
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const data = new Blob([excelBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(data, "relatorio-equipamentos.xlsx");
  };

  const prepareChartData = () => {
    const classifyStatus = (device) => {
      if (device.daysOffline === 0) return "Online";
      if (
        device.daysOffline === 1 ||
        device.daysOffline === 2 ||
        device.status === "observacao"
      )
        return "Em Observação";
      return "Offline";
    };
    const statusCount = { online: 0, observacao: 0, offline: 0 };
    filteredDevices.forEach((device) => {
      const status = classifyStatus(device);
      if (status === "Online") statusCount.online += 1;
      else if (status === "Em Observação") statusCount.observacao += 1;
      else statusCount.offline += 1;
    });

    // Agrupa os dias offline em faixas para melhor visualização
    const offlineRanges = {
      "0 dias": filteredDevices.filter((d) => d.daysOffline === 0).length,
      "1-2 dias": filteredDevices.filter(
        (d) => d.daysOffline === 1 || d.daysOffline === 2
      ).length,
      "3-7 dias": filteredDevices.filter(
        (d) => d.daysOffline > 2 && d.daysOffline <= 7
      ).length,
      "8-15 dias": filteredDevices.filter(
        (d) => d.daysOffline > 7 && d.daysOffline <= 15
      ).length,
      "16-30 dias": filteredDevices.filter(
        (d) => d.daysOffline > 15 && d.daysOffline <= 30
      ).length,
      "31-60 dias": filteredDevices.filter(
        (d) => d.daysOffline > 30 && d.daysOffline <= 60
      ).length,
      "60+ dias": filteredDevices.filter((d) => d.daysOffline > 60).length,
    };

    // Filtra as faixas de acordo com o limite máximo
    const filteredOfflineRanges = Object.entries(offlineRanges).reduce(
      (acc, [range, count]) => {
        const maxDays = parseInt(
          range.split("-")[0] || range.split("+")[0] || "0"
        );
        if (maxDays <= maxDaysOffline) {
          acc[range] = count;
        }
        return acc;
      },
      {}
    );

    // Dados para o gráfico de linha de tendência
    const trendData = filteredDevices
      .filter((d) => d.daysOffline <= maxDaysOffline)
      .sort((a, b) => a.daysOffline - b.daysOffline)
      .map((device) => ({
        dias: device.daysOffline,
        quantidade: 1,
      }))
      .reduce((acc, curr) => {
        const existing = acc.find((item) => item.dias === curr.dias);
        if (existing) {
          existing.quantidade += 1;
        } else {
          acc.push(curr);
        }
        return acc;
      }, []);

    return {
      statusData: [
        { name: "Online", value: statusCount.online },
        { name: "Em Observação", value: statusCount.observacao },
        { name: "Offline", value: statusCount.offline },
      ],
      offlineRangesData: Object.entries(filteredOfflineRanges).map(
        ([range, count]) => ({
          range,
          count,
        })
      ),
      trendData,
    };
  };

  const COLORS = ["#2e7d32", "#ffa000", "#d32f2f"];

  // Atualiza a lógica de exibição das tabelas
  const getFilteredDevicesByStatus = (status) => {
    return filteredDevices.filter((device) => {
      if (status === "online") {
        return device.daysOffline === 0;
      } else if (status === "observacao") {
        return (
          device.daysOffline === 1 ||
          device.daysOffline === 2 ||
          device.status === "observacao"
        );
      } else if (status === "offline") {
        return (
          device.daysOffline > 2 &&
          device.daysOffline <= maxDaysOffline &&
          device.status !== "observacao"
        );
      }
      return false;
    });
  };

  // No handleApiResponse, garantir que o JSON detalhado de cada IMEI seja salvo corretamente
  const handleApiResponse = (devices) => {
    const detailsMap = {};
    devices.forEach((device) => {
      // Tenta extrair o IMEI e o JSON detalhado de forma robusta
      let imei = device.imei;
      let details = null;
      if (device.data && Array.isArray(device.data) && device.data.length > 0) {
        details = device.data[0];
        imei = details.imei || imei;
      }
      if (imei && details) {
        detailsMap[imei] = details;
      }
    });
    setDeviceDetailsMap(detailsMap);
    setDevices(devices);
    setFilteredDevices(devices);
  };

  // Função para buscar detalhes do IMEI usando a mesma lógica do botão Verificar Status, com logs para depuração
  const handleImeiClick = async (imei) => {
    setSelectedDevice(null);
    setModalOpen(true);
    try {
      const response = await axios.post(`${apiUrl}/api/check-devices`, {
        imeis: [imei],
      });
      console.log("Resposta completa:", response); // Para debug

      // Verifica se temos dados originais
      if (
        response.data &&
        response.data.rawData &&
        response.data.rawData.length > 0
      ) {
        // Usa os dados originais da API
        const rawDevice = response.data.rawData[0];
        console.log("Dados originais do dispositivo:", rawDevice);
        setSelectedDevice(rawDevice);
      } else {
        setSelectedDevice({
          error: "Detalhes não encontrados para este IMEI.",
        });
      }
    } catch (err) {
      console.error("Erro ao buscar detalhes:", err);
      setSelectedDevice({ error: "Erro ao buscar detalhes do IMEI." });
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedDevice(null);
  };

  // Função para extrair vBat e porcentagem do campo Self Check Param
  const extractBatteryFromSelfCheck = (selfCheckParam) => {
    if (!selfCheckParam || typeof selfCheckParam !== "string") return null;
    // Exemplo: ...vBat=3775mV(40%)...
    const match = selfCheckParam.match(/vBat=(\d+)mV(?:\((\d+)%\))?/);
    if (match) {
      const voltage = parseInt(match[1], 10) / 1000; // converte para volts
      const percentage = match[2] ? parseInt(match[2], 10) : null;
      return { voltage, percentage };
    }
    return null;
  };

  // Componente de visualização da bateria (ajustado para aceitar valor e porcentagem)
  const BatteryIndicator = ({ voltage, percentage }) => {
    // Se porcentagem não for fornecida, calcula baseada na tensão
    let pct = percentage;
    if (pct === null || pct === undefined) {
      if (voltage >= 4.2) pct = 100;
      else if (voltage >= 4.0) pct = 80;
      else if (voltage >= 3.8) pct = 60;
      else if (voltage >= 3.6) pct = 40;
      else if (voltage >= 3.4) pct = 20;
      else pct = 0;
    }
    let color;
    if (pct >= 80) color = "#4caf50";
    else if (pct >= 40) color = "#ffa000";
    else color = "#f44336";
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box
          sx={{
            width: 40,
            height: 20,
            border: "2px solid #666",
            borderRadius: "2px",
            position: "relative",
            bgcolor: "#f5f5f5",
          }}
        >
          <Box
            sx={{
              width: `${pct}%`,
              height: "100%",
              bgcolor: color,
              transition: "width 0.3s ease",
            }}
          />
          <Box
            sx={{
              position: "absolute",
              right: -4,
              top: "50%",
              transform: "translateY(-50%)",
              width: 4,
              height: 8,
              bgcolor: "#666",
              borderRadius: "0 2px 2px 0",
            }}
          />
        </Box>
        <Typography variant="body2" sx={{ color }}>
          {pct}% ({voltage?.toFixed(2)}V)
        </Typography>
      </Box>
    );
  };

  const renderDeviceDetails = (device) => {
    if (!device) return <Typography>Carregando...</Typography>;
    if (device.error)
      return <Typography color="error">{device.error}</Typography>;

    // Função para formatar o valor
    const formatValue = (value) => {
      if (value === null || value === undefined) return "-";
      if (typeof value === "boolean") return value ? "Sim" : "Não";
      if (typeof value === "object") return JSON.stringify(value);
      return value.toString();
    };

    // Função para formatar a chave
    const formatKey = (key) => {
      return key
        .replace(/([A-Z])/g, " $1") // Adiciona espaço antes de letras maiúsculas
        .replace(/^./, (str) => str.toUpperCase()) // Primeira letra maiúscula
        .replace(/([a-z])([A-Z])/g, "$1 $2") // Adiciona espaço entre palavras
        .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2"); // Separa siglas
    };

    // Função para renderizar o valor com formatação especial
    const renderValue = (key, value, device) => {
      // Se for bat/battery, tenta extrair do Self Check Param
      if (key === "bat" || key === "battery") {
        // Procura Self Check Param nas configurações
        const selfCheck =
          device?.selfCheckParam ||
          device?.SelfCheckParam ||
          device?.["Self Check Param"];
        const batInfo = extractBatteryFromSelfCheck(selfCheck);
        if (batInfo) {
          return (
            <BatteryIndicator
              voltage={batInfo.voltage}
              percentage={batInfo.percentage}
            />
          );
        }
        // Se não encontrar, tenta usar o valor direto
        return (
          <BatteryIndicator
            voltage={typeof value === "number" ? value : null}
          />
        );
      }
      return (
        <Typography
          sx={{ wordBreak: "break-word", fontSize: { xs: "13px", sm: "15px" } }}
        >
          {formatValue(value)}
        </Typography>
      );
    };

    // Agrupa os campos por categoria
    const groupFields = (obj) => {
      const groups = {
        identificacao: ["imei", "iccid", "version", "mcu"],
        status: [
          "status",
          "mode",
          "csq",
          "bat",
          "power",
          "voltage",
          "temperature",
        ],
        tempo: [
          "firstTime",
          "lastTime",
          "todayLogin",
          "offLineDays",
          "daysOffline",
        ],
        rede: ["server", "getIp"],
        configuracao: ["config", "settings", "parameters", "selfCheckParam"],
        logs: ["log", "logs", "history", "events"],
        gps: ["gps", "latitude", "longitude", "location", "position"],
        alertas: ["alarm", "alert", "warning", "error"],
        diagnostico: ["diagnostic", "health", "check", "test"],
        outros: [],
      };

      const result = {};
      Object.keys(groups).forEach((group) => {
        result[group] = {};
      });

      Object.entries(obj).forEach(([key, value]) => {
        let added = false;
        for (const [group, fields] of Object.entries(groups)) {
          if (fields.includes(key)) {
            result[group][key] = value;
            added = true;
            break;
          }
        }
        if (!added) {
          result.outros[key] = value;
        }
      });

      return result;
    };

    const groupedData = groupFields(device);

    return (
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 3,
          maxWidth: "100vw",
          overflowX: "auto",
        }}
      >
        {/* Identificação */}
        <Paper
          sx={{
            p: 2,
            mb: 1,
            width: "100%",
            maxWidth: "100vw",
            overflowX: "auto",
            boxSizing: "border-box",
          }}
        >
          <Typography variant="h6" color="primary" gutterBottom>
            Identificação
          </Typography>
          <Grid
            container
            spacing={2}
            sx={{ width: "100%", maxWidth: "100vw", m: 0 }}
          >
            {Object.entries(groupedData.identificacao).map(([key, value]) => (
              <Grid item xs={12} sm={6} key={key}>
                <Typography variant="subtitle2" color="text.secondary">
                  {formatKey(key)}:
                </Typography>
                <Typography
                  sx={{
                    wordBreak: "break-word",
                    fontSize: { xs: "13px", sm: "15px" },
                  }}
                >
                  {formatValue(value)}
                </Typography>
              </Grid>
            ))}
          </Grid>
        </Paper>

        {/* Status */}
        <Paper
          sx={{
            p: 2,
            mb: 1,
            width: "100%",
            maxWidth: "100vw",
            overflowX: "auto",
            boxSizing: "border-box",
          }}
        >
          <Typography variant="h6" color="primary" gutterBottom>
            Status do Equipamento
          </Typography>
          <Grid
            container
            spacing={2}
            sx={{ width: "100%", maxWidth: "100vw", m: 0 }}
          >
            {Object.entries(groupedData.status).map(([key, value]) => (
              <Grid item xs={12} sm={6} key={key}>
                <Typography variant="subtitle2" color="text.secondary">
                  {formatKey(key)}:
                </Typography>
                {renderValue(key, value, device)}
              </Grid>
            ))}
          </Grid>
        </Paper>

        {/* Tempo */}
        <Paper
          sx={{
            p: 2,
            mb: 1,
            width: "100%",
            maxWidth: "100vw",
            overflowX: "auto",
            boxSizing: "border-box",
          }}
        >
          <Typography variant="h6" color="primary" gutterBottom>
            Informações de Tempo
          </Typography>
          <Grid
            container
            spacing={2}
            sx={{ width: "100%", maxWidth: "100vw", m: 0 }}
          >
            {Object.entries(groupedData.tempo).map(([key, value]) => (
              <Grid item xs={12} sm={6} key={key}>
                <Typography variant="subtitle2" color="text.secondary">
                  {formatKey(key)}:
                </Typography>
                <Typography
                  sx={{
                    wordBreak: "break-word",
                    fontSize: { xs: "13px", sm: "15px" },
                  }}
                >
                  {formatValue(value)}
                </Typography>
              </Grid>
            ))}
          </Grid>
        </Paper>

        {/* Rede */}
        <Paper
          sx={{
            p: 2,
            mb: 1,
            width: "100%",
            maxWidth: "100vw",
            overflowX: "auto",
            boxSizing: "border-box",
          }}
        >
          <Typography variant="h6" color="primary" gutterBottom>
            Informações de Rede
          </Typography>
          <Grid
            container
            spacing={2}
            sx={{ width: "100%", maxWidth: "100vw", m: 0 }}
          >
            {Object.entries(groupedData.rede).map(([key, value]) => (
              <Grid item xs={12} sm={6} key={key}>
                <Typography variant="subtitle2" color="text.secondary">
                  {formatKey(key)}:
                </Typography>
                <Typography
                  sx={{
                    wordBreak: "break-word",
                    fontSize: { xs: "13px", sm: "15px" },
                  }}
                >
                  {formatValue(value)}
                </Typography>
              </Grid>
            ))}
          </Grid>
        </Paper>

        {/* Configuração */}
        {Object.keys(groupedData.configuracao).length > 0 && (
          <Paper
            sx={{
              p: 2,
              mb: 1,
              width: "100%",
              maxWidth: "100vw",
              overflowX: "auto",
              boxSizing: "border-box",
            }}
          >
            <Typography variant="h6" color="primary" gutterBottom>
              Configurações
            </Typography>
            <Grid
              container
              spacing={2}
              sx={{ width: "100%", maxWidth: "100vw", m: 0 }}
            >
              {Object.entries(groupedData.configuracao).map(([key, value]) => (
                <Grid item xs={12} sm={6} key={key}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {formatKey(key)}:
                  </Typography>
                  {key.toLowerCase().includes("selfcheck") &&
                  typeof value === "string" ? (
                    <Box
                      sx={{
                        bgcolor: "#e3f2fd",
                        p: 1.5,
                        borderRadius: 2,
                        mt: 1,
                        fontFamily: "monospace",
                        fontSize: { xs: "12px", sm: "14px" },
                        overflowX: "auto",
                        wordBreak: "break-word",
                        maxWidth: "100vw",
                        border: "1px solid #90caf9",
                        boxSizing: "border-box",
                      }}
                    >
                      {value.split(";").map((item, idx) => {
                        const [label, ...rest] = item.split(":");
                        const content = rest.join(":");
                        return (
                          <Box
                            key={idx}
                            component="div"
                            sx={{
                              mb: 0.5,
                              display: "flex",
                              alignItems: "baseline",
                            }}
                          >
                            <Typography
                              component="span"
                              sx={{ color: "#111", minWidth: 110 }}
                            >
                              {label.trim()}
                            </Typography>
                            <Typography
                              component="span"
                              sx={{ ml: 1, color: "#111" }}
                            >
                              {content.trim()}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  ) : (
                    <Typography
                      sx={{
                        wordBreak: "break-word",
                        fontSize: { xs: "13px", sm: "15px" },
                      }}
                    >
                      {formatValue(value)}
                    </Typography>
                  )}
                </Grid>
              ))}
            </Grid>
          </Paper>
        )}

        {/* GPS */}
        {Object.keys(groupedData.gps).length > 0 && (
          <Paper
            sx={{
              p: 2,
              mb: 1,
              width: "100%",
              maxWidth: "100vw",
              overflowX: "auto",
              boxSizing: "border-box",
            }}
          >
            <Typography variant="h6" color="primary" gutterBottom>
              Informações de Localização
            </Typography>
            <Grid
              container
              spacing={2}
              sx={{ width: "100%", maxWidth: "100vw", m: 0 }}
            >
              {Object.entries(groupedData.gps).map(([key, value]) => (
                <Grid item xs={12} sm={6} key={key}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {formatKey(key)}:
                  </Typography>
                  <Typography
                    sx={{
                      wordBreak: "break-word",
                      fontSize: { xs: "13px", sm: "15px" },
                    }}
                  >
                    {formatValue(value)}
                  </Typography>
                </Grid>
              ))}
            </Grid>
          </Paper>
        )}

        {/* Alertas */}
        {Object.keys(groupedData.alertas).length > 0 && (
          <Paper
            sx={{
              p: 2,
              mb: 1,
              width: "100%",
              maxWidth: "100vw",
              overflowX: "auto",
              boxSizing: "border-box",
            }}
          >
            <Typography variant="h6" color="primary" gutterBottom>
              Alertas e Avisos
            </Typography>
            <Grid
              container
              spacing={2}
              sx={{ width: "100%", maxWidth: "100vw", m: 0 }}
            >
              {Object.entries(groupedData.alertas).map(([key, value]) => (
                <Grid item xs={12} sm={6} key={key}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {formatKey(key)}:
                  </Typography>
                  <Typography
                    sx={{
                      wordBreak: "break-word",
                      fontSize: { xs: "13px", sm: "15px" },
                    }}
                  >
                    {formatValue(value)}
                  </Typography>
                </Grid>
              ))}
            </Grid>
          </Paper>
        )}

        {/* Diagnóstico */}
        {Object.keys(groupedData.diagnostico).length > 0 && (
          <Paper
            sx={{
              p: 2,
              mb: 1,
              width: "100%",
              maxWidth: "100vw",
              overflowX: "auto",
              boxSizing: "border-box",
            }}
          >
            <Typography variant="h6" color="primary" gutterBottom>
              Diagnóstico e Saúde
            </Typography>
            <Grid
              container
              spacing={2}
              sx={{ width: "100%", maxWidth: "100vw", m: 0 }}
            >
              {Object.entries(groupedData.diagnostico).map(([key, value]) => (
                <Grid item xs={12} sm={6} key={key}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {formatKey(key)}:
                  </Typography>
                  <Typography
                    sx={{
                      wordBreak: "break-word",
                      fontSize: { xs: "13px", sm: "15px" },
                    }}
                  >
                    {formatValue(value)}
                  </Typography>
                </Grid>
              ))}
            </Grid>
          </Paper>
        )}

        {/* Outros */}
        {Object.keys(groupedData.outros).length > 0 && (
          <Paper
            sx={{
              p: 2,
              mb: 1,
              width: "100%",
              maxWidth: "100vw",
              overflowX: "auto",
              boxSizing: "border-box",
            }}
          >
            <Typography variant="h6" color="primary" gutterBottom>
              Outras Informações
            </Typography>
            <Grid
              container
              spacing={2}
              sx={{ width: "100%", maxWidth: "100vw", m: 0 }}
            >
              {Object.entries(groupedData.outros).map(([key, value]) => (
                <Grid item xs={12} sm={6} key={key}>
                  <Typography variant="subtitle2" color="text.secondary">
                    {formatKey(key)}:
                  </Typography>
                  <Typography
                    sx={{
                      wordBreak: "break-word",
                      fontSize: { xs: "13px", sm: "15px" },
                    }}
                  >
                    {formatValue(value)}
                  </Typography>
                </Grid>
              ))}
            </Grid>
          </Paper>
        )}

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
          <Button
            variant="outlined"
            onClick={() => setShowRawJson(!showRawJson)}
            sx={{ mb: 0 }}
          >
            {showRawJson ? "Ver Detalhes Formatados" : "Ver JSON Completo"}
          </Button>
        </Box>

        {showRawJson && (
          <Box
            sx={{
              bgcolor: "#f5f5f5",
              p: 2,
              borderRadius: 1,
              overflow: "auto",
              maxHeight: "70vh",
            }}
          >
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                fontFamily: "monospace",
                fontSize: "14px",
              }}
            >
              {JSON.stringify(device, null, 2)}
            </pre>
          </Box>
        )}
      </Box>
    );
  };

  // Função para calcular o máximo de dias offline
  const calculateMaxOfflineDays = (devicesList) => {
    const maxDays = Math.max(...devicesList.map((d) => d.daysOffline ?? 0));
    setMaxOfflineDays(maxDays);
    return maxDays;
  };

  const statusData = prepareChartData().statusData;
  const offlineRangesData = prepareChartData().offlineRangesData;
  const trendData = prepareChartData().trendData;
  const totalDevices = filteredDevices.length;
  const totalOfflineRanges = filteredDevices.length;
  const totalTrend = filteredDevices.length;

  return (
    <ThemeProvider theme={theme}>
      <Container
        maxWidth={false}
        sx={{
          py: 4,
          px: { xs: 1, sm: 2, md: 4, lg: 8 },
          bgcolor: "background.default",
          minHeight: "100vh",
        }}
      >
        <Typography
          variant="h4"
          component="h1"
          gutterBottom
          align="center"
          sx={{
            fontSize: { xs: "1.5rem", sm: "2rem", md: "2.5rem" },
            color: "primary.main",
            fontWeight: 600,
            mb: 4,
          }}
        >
          Verificação de Status de Equipamentos
        </Typography>

        <Paper
          sx={{
            p: { xs: 2, sm: 3 },
            mb: 3,
            bgcolor: "background.paper",
            transition: "all 0.3s ease",
          }}
        >
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              multiline
              rows={4}
              variant="outlined"
              label="IMEIs (um por linha ou separados por vírgula)"
              value={imeis}
              onChange={handleImeiChange}
              sx={{ mb: 2 }}
              helperText={`${imeiCount} IMEI(s) detectado(s)`}
            />
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              disabled={loading || imeiCount === 0}
              sx={{
                mb: 2,
                height: 48,
                fontSize: "1.1rem",
              }}
            >
              {loading ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CircularProgress size={24} color="inherit" />
                  Verificando...
                </Box>
              ) : (
                "Verificar Status"
              )}
            </Button>
          </form>

          {processingStatus && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                {processingStatus}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  bgcolor: "primary.light",
                  "& .MuiLinearProgress-bar": {
                    bgcolor: "primary.main",
                  },
                }}
              />
            </Box>
          )}

          {devices.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography gutterBottom sx={{ color: "text.secondary" }}>
                Filtro de Dias Offline: {maxDaysOffline} dias
              </Typography>
              <Slider
                value={maxDaysOffline}
                onChange={handleMaxDaysChange}
                min={0}
                max={maxOfflineDays}
                valueLabelDisplay="auto"
                sx={{
                  mb: 2,
                  color: "primary.main",
                  "& .MuiSlider-thumb": {
                    width: 16,
                    height: 16,
                  },
                }}
              />
              <Button
                variant="contained"
                color="secondary"
                fullWidth
                onClick={generateExcel}
                sx={{ height: 48 }}
              >
                Exportar Excel
              </Button>
            </Box>
          )}
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {filteredDevices.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" gutterBottom>
              Gráficos de Status
            </Typography>
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", md: "row" },
                gap: 2,
                mb: 4,
              }}
            >
              <Paper sx={{ p: 2, flex: 1, minWidth: { xs: "100%", md: 300 } }}>
                <Typography variant="subtitle1" gutterBottom>
                  Distribuição por Status
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, value }) =>
                        `${name} (${
                          totalDevices > 0
                            ? ((value / totalDevices) * 100).toFixed(0)
                            : 0
                        }%)`
                      }
                    >
                      {statusData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value) => [
                        `${value} equipamentos`,
                        "Quantidade",
                      ]}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Paper>
              <Paper sx={{ p: 2, flex: 1, minWidth: { xs: "100%", md: 300 } }}>
                <Typography variant="subtitle1" gutterBottom>
                  Distribuição por Faixas de Dias Offline
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={offlineRangesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="range"
                      angle={-45}
                      textAnchor="end"
                      height={70}
                      interval={0}
                    />
                    <YAxis
                      label={{
                        value: "Quantidade",
                        angle: -90,
                        position: "insideLeft",
                      }}
                    />
                    <RechartsTooltip
                      formatter={(value, name, props) => [
                        `${value} equipamentos (${
                          totalOfflineRanges > 0
                            ? ((value / totalOfflineRanges) * 100).toFixed(0)
                            : 0
                        }%)`,
                        "Quantidade",
                      ]}
                    />
                    <Legend />
                    <Bar
                      dataKey="count"
                      fill="#8884d8"
                      name="Quantidade de Equipamentos"
                      label={({ value }) =>
                        `${
                          totalOfflineRanges > 0
                            ? ((value / totalOfflineRanges) * 100).toFixed(0)
                            : 0
                        }%`
                      }
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Box>
            <Paper sx={{ p: 2, mb: 4 }}>
              <Typography variant="subtitle1" gutterBottom>
                Tendência de Dias Offline
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="dias"
                    label={{
                      value: "Dias Offline",
                      position: "insideBottom",
                      offset: -5,
                    }}
                  />
                  <YAxis
                    label={{
                      value: "Quantidade",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <RechartsTooltip
                    formatter={(value, name, props) => [
                      `${value} equipamentos (${
                        totalTrend > 0
                          ? ((value / totalTrend) * 100).toFixed(0)
                          : 0
                      }%)`,
                      "Quantidade",
                    ]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="quantidade"
                    stroke="#8884d8"
                    name="Quantidade de Equipamentos"
                    dot={{ r: 4 }}
                    activeDot={{ r: 8 }}
                    label={({ value }) =>
                      `${
                        totalTrend > 0
                          ? ((value / totalTrend) * 100).toFixed(0)
                          : 0
                      }%`
                    }
                  />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Box>
        )}

        {devices.length > 0 && (
          <Box sx={{ mb: 4 }}>
            <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
              <Button
                variant={selectedTab === "online" ? "contained" : "outlined"}
                color="success"
                onClick={() => setSelectedTab("online")}
                sx={{ mr: 1, mb: 1 }}
              >
                Online ({getFilteredDevicesByStatus("online").length})
              </Button>
              <Button
                variant={
                  selectedTab === "observacao" ? "contained" : "outlined"
                }
                color="warning"
                onClick={() => setSelectedTab("observacao")}
                sx={{ mr: 1, mb: 1 }}
              >
                Em Observação ({getFilteredDevicesByStatus("observacao").length}
                )
              </Button>
              <Button
                variant={selectedTab === "offline" ? "contained" : "outlined"}
                color="error"
                onClick={() => setSelectedTab("offline")}
                sx={{ mr: 1, mb: 1 }}
              >
                Offline ({getFilteredDevicesByStatus("offline").length})
              </Button>
              <Button
                variant={
                  selectedTab === "naoEncontrados" ? "contained" : "outlined"
                }
                color="warning"
                onClick={() => setSelectedTab("naoEncontrados")}
                sx={{ mb: 1 }}
              >
                Não Encontrados ({errorImeis.length})
              </Button>
            </Box>

            <Paper
              sx={{
                p: 2,
                bgcolor:
                  selectedTab === "online"
                    ? "#e8f5e9"
                    : selectedTab === "observacao"
                    ? "#fffde7"
                    : selectedTab === "offline"
                    ? "#ffebee"
                    : "#fffde7",
              }}
            >
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>IMEI</TableCell>
                      <TableCell>Horário Original</TableCell>
                      <TableCell>Horário Brasília</TableCell>
                      <TableCell>Horário China</TableCell>
                      <TableCell>Dias Offline</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedTab === "online" &&
                      getFilteredDevicesByStatus("online").map((device) => (
                        <TableRow key={device.imei}>
                          <TableCell>
                            <Tooltip title="Ver detalhes do IMEI">
                              <Button
                                variant="text"
                                color="primary"
                                onClick={() => handleImeiClick(device.imei)}
                                sx={{ textTransform: "none", fontWeight: 600 }}
                              >
                                {device.imei}
                              </Button>
                            </Tooltip>
                          </TableCell>
                          <TableCell>{device.lastTime}</TableCell>
                          <TableCell>
                            {getBrasiliaTime(device.lastTime)}
                          </TableCell>
                          <TableCell>{getChinaTime(device.lastTime)}</TableCell>
                          <TableCell>
                            <Box
                              sx={{ color: "success.main", fontWeight: "bold" }}
                            >
                              {device.daysOffline} dias
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    {selectedTab === "observacao" &&
                      getFilteredDevicesByStatus("observacao").map((device) => (
                        <TableRow key={device.imei}>
                          <TableCell>
                            <Tooltip title="Ver detalhes do IMEI">
                              <Button
                                variant="text"
                                color="primary"
                                onClick={() => handleImeiClick(device.imei)}
                                sx={{ textTransform: "none", fontWeight: 600 }}
                              >
                                {device.imei}
                              </Button>
                            </Tooltip>
                          </TableCell>
                          <TableCell>{device.lastTime}</TableCell>
                          <TableCell>
                            {getBrasiliaTime(device.lastTime)}
                          </TableCell>
                          <TableCell>{getChinaTime(device.lastTime)}</TableCell>
                          <TableCell>
                            <Box
                              sx={{
                                color: "warning.main",
                                fontWeight: "bold",
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              {device.daysOffline} dias
                              {device.status === "observacao" && (
                                <Typography
                                  variant="caption"
                                  sx={{ color: "text.secondary" }}
                                >
                                  (Movido para observação)
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    {selectedTab === "offline" &&
                      getFilteredDevicesByStatus("offline").map((device) => (
                        <TableRow key={device.imei}>
                          <TableCell>
                            <Tooltip title="Ver detalhes do IMEI">
                              <Button
                                variant="text"
                                color="primary"
                                onClick={() => handleImeiClick(device.imei)}
                                sx={{ textTransform: "none", fontWeight: 600 }}
                              >
                                {device.imei}
                              </Button>
                            </Tooltip>
                          </TableCell>
                          <TableCell>{device.lastTime}</TableCell>
                          <TableCell>
                            {getBrasiliaTime(device.lastTime)}
                          </TableCell>
                          <TableCell>{getChinaTime(device.lastTime)}</TableCell>
                          <TableCell>
                            <Box
                              sx={{ color: "error.main", fontWeight: "bold" }}
                            >
                              {device.daysOffline} dias
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                    {selectedTab === "naoEncontrados" &&
                      errorImeis.map((imei) => (
                        <TableRow key={imei}>
                          <TableCell colSpan={5}>{imei}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Box>
        )}

        {/* Modal de detalhes do IMEI */}
        <Dialog
          open={modalOpen}
          onClose={handleCloseModal}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            Detalhes do Equipamento
            <IconButton
              aria-label="close"
              onClick={handleCloseModal}
              sx={{ position: "absolute", right: 8, top: 8 }}
            >
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent
            dividers
            sx={{
              p: { xs: 1, sm: 2 },
              maxWidth: "100vw",
              overflowX: "auto",
            }}
          >
            {renderDeviceDetails(selectedDevice)}
          </DialogContent>
          <DialogActions>
            <Button
              onClick={handleCloseModal}
              color="primary"
              variant="contained"
            >
              Fechar
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </ThemeProvider>
  );
}

export default App;
