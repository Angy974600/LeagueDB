import concurrent
from dotenv import load_dotenv
import os
import time
from typing import Any,Dict,List,Optional
import requests


load_dotenv()

class RiotAPIClient:
    """Client per query alle APIs di Riot Games con rate-limiting automatico e gestione di retry"""
    
    def __init__(self):
        self.api_key= os.getenv("RIOT_API_KEY")
        if not self.api_key:
            raise ValueError("RIOT_API_KEY non trovata in .env")
        self.session=requests.Session()
        self.session.headers.update({"X-Riot-Token":self.api_key})
    def _request(self,url:str,params: Optional[Dict[str,Any]]=None,max_retries:int=10)-> Any:
        current_retries=0
        while True:
            response=self.session.get(url,params=params)
            if response.status_code==200:
                return response.json()
            elif response.status_code ==401:
                raise PermissionError("API key mancante o non valida")
            elif response.status_code==403:
                raise PermissionError("API key scaduta o non abilitata")
            elif response.status_code==404:
                return None
            elif response.status_code==429:
                current_retries+=1   
                if current_retries>max_retries:
                    raise TimeoutError("Superato il numero di tentativi")
                time_to_wait=response.headers.get("Retry-After","5")
                try:
                    retry_seconds=int(time_to_wait)
                except ValueError:
                    retry_seconds=5
                safety_margin=1
                sleep_time=retry_seconds+safety_margin
                print(f"Rate limit superato, attendo {sleep_time} secondi")
                time.sleep(sleep_time)
                continue
            else:
                response.raise_for_status()
    def get_account_by_riot_id(self,ign:str,tag_line:str, routing_reqion:str ="europe") -> Optional[Dict[str,Any]]:
        """Recurpera i dati di un account tramite riot id e il tag (es.Anfrost#EUW)
        Routing regions: 'europe', 'americas', 'asia', 'sea'
        """

        request_url = f"https://{routing_reqion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{ign}/{tag_line}"
        return self._request(request_url)
    
    def get_summoner_by_puuid(self,puuid:str,routing_reqion:str="europe") -> Optional[Dict[str,Any]]:
        """Recupera i dati di un summoner tramite il puuid dell'account.
        Restituisce profileIconId,revisionDate,puuid,summonerLevel
        Routing regions: 'europe', 'americas', 'asia', 'sea'
        """
        request_url =f"https://{routing_reqion}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/{puuid}"
        return self._request(request_url)  

    def get_league_entries_by_puuid(self,puuid:str,routing_reqion:str="europe") -> Optional[Dict[str,Any]]:
        """Recupera i rank di un account in tutte le code
        Routing regions: 'europe', 'americas', 'asia', 'sea'
        """
        request_url=f"https://{routing_reqion}.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}"
        data=self._request(request_url)
        return data if data is not None else []
    def get_league_entries(self,summoner_id:str,routing_reqion:str="europe") -> Optional[Dict[str,Any]]:
        """Recupera il Rank di un summoner in base al summonerId
        Routing regions: 'europe', 'americas', 'asia', 'sea'
        """
        url=f"https://{routing_reqion}.api.riotgames.com/lol/league/v4/entries/{summoner_id}"
        data = self._request(url)  
        return data if data is not None else []
    
    
    def get_recent_match_ids(self, puuid:str, routing_region:str="europe", count:int=5)-> List[str]:
        """Recupera i match_id degli ultimi count match giocati
        Routing regions: 'europe', 'americas', 'asia', 'sea'
        """

        url = f"https://{routing_region}.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids"
        all_match_ids: List[str] = []
        max_page_size=100
        start_idx=0
        get_all=(count is None or count<=0)
        while True:
            if not get_all:
                remaining=count-len(all_match_ids)
                if remaining<=0:
                    break
                page_size=min(remaining,max_page_size)
            else:
                page_size=max_page_size
            data = self._request(url, params={"start":start_idx,"count":page_size})
            if data:
                all_match_ids.extend(data)
            else:
                break
            if get_all and len(all_match_ids)%200 ==0:
                print(f"[Scansione storico] {len(all_match_ids)} Match gia' scaricati")
            if len(data)<page_size:
                break
            start_idx+=len(data)
        return all_match_ids
    def get_match_details(self,match_id:str,routing_region:str="europe")->Optional[Dict[str,Any]]:
        """Recupera tutti i dati di un match"""
        url = f"https://{routing_region}.api.riotgames.com/lol/match/v5/matches/{match_id}"
        data = self._request(url)
        return data if data is not None else None
    def get_all_champion_mastery_sorted_by_puuid(self,puuid:str,routing_region:str="europe"):
        """Recupera tutti i punteggi maestria di un giocatore in ordine descrescente"""
        url=f"https://{routing_region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}"
        data=self._request(url)
        return data if data is not None else None

    def get_champion_mastery_by_puuid_and_champion_id(self,puuid:str,champion_id:int,routing_region:str="europe")-> Optional[Dict[str,Any]]:
        """ Recupera i punteggi di maestria di un giocatore per un champion specifico"""
        url=f"https://{routing_region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}/by-champion/{champion_id}"
        data=self._request(url)
        return data if data is not None else None


                    