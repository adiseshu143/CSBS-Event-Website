/**
 * AdminQRScanner — Camera-based QR code scanner for ticket verification.
 * Only renders inside the admin dashboard (protected by auth context).
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { verifyTicket } from '../services/googleAppsScript';
import './AdminQRScanner.css';

interface ScanResult {
  type: 'success' | 'already' | 'error';
  message: string;
  data?: {
    ticketNumber?: string;
    teamName?: string;
    leaderName?: string;
    registrationId?: string;
  };
}

interface AdminQRScannerProps {
  /** Called after a successful verification so parent can refresh data */
  onVerified?: () => void;
}

export default function AdminQRScanner({ onVerified }: AdminQRScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = 'admin-qr-reader';

  /* --- Stop camera cleanly --- */
  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current?.isScanning) {
        await scannerRef.current.stop();
      }
    } catch {
      // Ignore — scanner may already be stopped
    }
    setScanning(false);
  }, []);

  /* --- Handle a decoded QR value --- */
  const handleScan = useCallback(
    async (decodedText: string) => {
      if (processing) return;
      setProcessing(true);
      setScanResult(null);

      // Stop camera immediately after a scan
      await stopScanner();

      try {
        // The QR code should contain the ticket number
        const ticketNumber = decodedText.trim();
        if (!ticketNumber) {
          setScanResult({ type: 'error', message: 'Empty QR code.' });
          setProcessing(false);
          return;
        }

        const result = await verifyTicket(ticketNumber);

        if (result.status === 'success') {
          if (result.data?.alreadyVerified) {
            setScanResult({
              type: 'already',
              message: 'Already Verified',
              data: result.data,
            });
          } else {
            setScanResult({
              type: 'success',
              message: 'Verified Successfully!',
              data: result.data,
            });
            onVerified?.();
          }
        } else {
          setScanResult({
            type: 'error',
            message: result.message || 'Invalid Ticket',
          });
        }
      } catch (err) {
        setScanResult({
          type: 'error',
          message: err instanceof Error ? err.message : 'Verification failed',
        });
      } finally {
        setProcessing(false);
      }
    },
    [processing, stopScanner, onVerified],
  );

  /* --- Start camera --- */
  const startScanner = useCallback(async () => {
    setScanResult(null);
    setCameraError(null);

    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(scannerContainerId);
      }

      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          handleScan(decodedText);
        },
        () => {
          // QR not detected in this frame — ignore
        },
      );
      setScanning(true);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Could not access camera';
      setCameraError(msg);
      setScanning(false);
    }
  }, [handleScan]);

  /* --- Cleanup on unmount --- */
  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="qr-scanner-section">
      <div className="qr-scanner-header">
        <div className="qr-scanner-title-row">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          <h3>QR Ticket Scanner</h3>
        </div>
        <p className="qr-scanner-subtitle">
          Scan a registration QR code to verify attendance
        </p>
      </div>

      {/* Camera viewport */}
      <div className="qr-scanner-viewport">
        <div id={scannerContainerId} className="qr-scanner-reader" />
        {!scanning && !scanResult && !cameraError && (
          <div className="qr-scanner-placeholder">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#9ca3af"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span>Camera preview will appear here</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="qr-scanner-controls">
        {!scanning ? (
          <button
            className="qr-btn qr-btn-start"
            onClick={startScanner}
            disabled={processing}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Start Scanner
          </button>
        ) : (
          <button
            className="qr-btn qr-btn-stop"
            onClick={stopScanner}
            disabled={processing}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            Stop Scanner
          </button>
        )}

        {scanning && (
          <span className="qr-scanning-indicator">
            <span className="qr-scanning-dot" />
            Scanning...
          </span>
        )}
      </div>

      {/* Camera error */}
      {cameraError && (
        <div className="qr-result qr-result-error">
          <span className="qr-result-icon">⚠️</span>
          <div>
            <strong>Camera Error</strong>
            <p>{cameraError}</p>
          </div>
        </div>
      )}

      {/* Processing */}
      {processing && (
        <div className="qr-result qr-result-processing">
          <span className="qr-spinner-sm" />
          <span>Verifying ticket...</span>
        </div>
      )}

      {/* Scan results */}
      {scanResult && !processing && (
        <div className={`qr-result qr-result-${scanResult.type}`}>
          <span className="qr-result-icon">
            {scanResult.type === 'success'
              ? '✅'
              : scanResult.type === 'already'
                ? '🔵'
                : '❌'}
          </span>
          <div className="qr-result-body">
            <strong>{scanResult.message}</strong>
            {scanResult.data && (
              <div className="qr-result-details">
                {scanResult.data.teamName && (
                  <span>
                    Team: <b>{scanResult.data.teamName}</b>
                  </span>
                )}
                {scanResult.data.leaderName && (
                  <span>
                    Leader: <b>{scanResult.data.leaderName}</b>
                  </span>
                )}
                {scanResult.data.ticketNumber && (
                  <span className="qr-result-ticket">
                    {scanResult.data.ticketNumber}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
