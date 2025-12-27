import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

interface MapConnection {
  id: number;
  fromLocation: string;
  toLocation: string;
  connectionType: string;
  fromPosition: { x: number; y: number } | null;
  toPosition: { x: number; y: number } | null;
  requiresKey: string | null;
  requiredSigils: number;
  requiredQuest: string | null;
  isOneWay: boolean;
  isHidden: boolean;
  transitionText: string | null;
}

interface ExitPoint {
  connection: MapConnection;
  distance: number;
}

interface UseMapTransitionOptions {
  currentLocation: string;
  playerPosition: { x: number; y: number } | null;
  proximityThreshold?: number;
  playerSigils?: number;
  playerItems?: string[];
  completedQuests?: string[];
  onTransitionStart?: (destination: string, transitionText: string | null) => void;
  onTransitionComplete?: (destination: string, spawnPosition: { x: number; y: number } | null) => void;
}

export function useMapTransition({
  currentLocation,
  playerPosition,
  proximityThreshold = 32,
  playerSigils = 0,
  playerItems = [],
  completedQuests = [],
  onTransitionStart,
  onTransitionComplete,
}: UseMapTransitionOptions) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDestination, setTransitionDestination] = useState<string | null>(null);
  const [nearbyExit, setNearbyExit] = useState<ExitPoint | null>(null);
  const lastTransitionRef = useRef<number>(0);

  const { data: connections = [], isLoading } = useQuery<MapConnection[]>({
    queryKey: ["/api/rpg/map-connections", currentLocation],
    enabled: !!currentLocation,
  });

  const visibleConnections = useMemo(() => {
    return connections.filter(conn => {
      if (conn.isHidden && playerSigils < 1) return false;
      return true;
    });
  }, [connections, playerSigils]);

  const checkProximity = useCallback((position: { x: number; y: number }) => {
    if (!visibleConnections.length) return null;

    let closestExit: ExitPoint | null = null;

    for (const conn of visibleConnections) {
      if (!conn.fromPosition) continue;

      const dx = position.x - conn.fromPosition.x;
      const dy = position.y - conn.fromPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= proximityThreshold) {
        if (!closestExit || distance < closestExit.distance) {
          closestExit = { connection: conn, distance };
        }
      }
    }

    return closestExit;
  }, [visibleConnections, proximityThreshold]);

  useEffect(() => {
    if (!playerPosition || isTransitioning) {
      setNearbyExit(null);
      return;
    }

    const exit = checkProximity(playerPosition);
    setNearbyExit(exit);
  }, [playerPosition, checkProximity, isTransitioning]);

  const canUseExit = useCallback((connection: MapConnection): { allowed: boolean; reason?: string } => {
    if (connection.requiresKey && !playerItems.includes(connection.requiresKey)) {
      return { allowed: false, reason: `Requires ${connection.requiresKey}` };
    }
    if (connection.requiredSigils > playerSigils) {
      return { allowed: false, reason: `Requires ${connection.requiredSigils} Sigils of Secrecy` };
    }
    if (connection.requiredQuest && !completedQuests.includes(connection.requiredQuest)) {
      return { allowed: false, reason: "Complete a specific quest first" };
    }
    return { allowed: true };
  }, [playerItems, playerSigils, completedQuests]);

  const initiateTransition = useCallback(async (connection?: MapConnection) => {
    const now = Date.now();
    if (now - lastTransitionRef.current < 1000) return false;
    
    const targetConnection = connection || nearbyExit?.connection;
    if (!targetConnection) return false;

    const access = canUseExit(targetConnection);
    if (!access.allowed) {
      console.warn("Cannot use exit:", access.reason);
      return false;
    }

    lastTransitionRef.current = now;
    setIsTransitioning(true);
    setTransitionDestination(targetConnection.toLocation);

    if (onTransitionStart) {
      onTransitionStart(targetConnection.toLocation, targetConnection.transitionText);
    }

    await new Promise(resolve => setTimeout(resolve, 600));

    if (onTransitionComplete) {
      onTransitionComplete(targetConnection.toLocation, targetConnection.toPosition);
    }

    setIsTransitioning(false);
    setTransitionDestination(null);
    setNearbyExit(null);

    return true;
  }, [nearbyExit, canUseExit, onTransitionStart, onTransitionComplete]);

  const getExitPromptText = useCallback((): string | null => {
    if (!nearbyExit) return null;
    
    const access = canUseExit(nearbyExit.connection);
    if (!access.allowed) {
      return access.reason || "Locked";
    }

    const typeLabels: Record<string, string> = {
      door: "Enter",
      stairs: "Climb",
      path: "Follow path to",
      hidden: "Secret passage to",
      locked: "Locked",
      portal: "Portal to",
    };

    const action = typeLabels[nearbyExit.connection.connectionType] || "Go to";
    return `${action} ${nearbyExit.connection.toLocation}`;
  }, [nearbyExit, canUseExit]);

  return {
    connections: visibleConnections,
    isLoading,
    isTransitioning,
    transitionDestination,
    nearbyExit,
    initiateTransition,
    canUseExit,
    getExitPromptText,
    checkProximity,
  };
}
