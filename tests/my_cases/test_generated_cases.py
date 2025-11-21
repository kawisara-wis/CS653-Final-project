import json, uuid
from agents.dispatcher_agent import run

CASES = []
CASES.append((
json.loads(r'''{"offer_id": "CASE-0000", "customer_id": "C1", "origin_address": "Bangna, Bangkok, Thailand", "volume_cbm": 120.0, "duration_days": 30, "sla": {"latest_dropoff_hour": 18, "weekday_only": true}}''')
,
json.loads(r'''{"accept": null, "chosen_warehouse": null, "min_candidates": 1}''')
))
CASES.append((
json.loads(r'''{"offer_id": "CASE-0001", "customer_id": "C2", "origin_address": "Lat Krabang, Bangkok, Thailand", "volume_cbm": 120.0, "duration_days": 30, "sla": {"latest_dropoff_hour": 18, "weekday_only": true}}''')
,
json.loads(r'''{"accept": null, "chosen_warehouse": null, "min_candidates": 1}''')
))
CASES.append((
json.loads(r'''{"offer_id": "CASE-0002", "customer_id": "C3", "origin_address": "Suan Luang, Bangkok, Thailand", "volume_cbm": 120.0, "duration_days": 30, "sla": {"latest_dropoff_hour": 18, "weekday_only": true}}''')
,
json.loads(r'''{"accept": null, "chosen_warehouse": null, "min_candidates": 1}''')
))
CASES.append((
json.loads(r'''{"offer_id": "CASE-0003", "customer_id": "C4", "origin_address": "Bang Kapi, Bangkok, Thailand", "volume_cbm": 120.0, "duration_days": 30, "sla": {"latest_dropoff_hour": 18, "weekday_only": true}}''')
,
json.loads(r'''{"accept": null, "chosen_warehouse": null, "min_candidates": 1}''')
))
CASES.append((
json.loads(r'''{"offer_id": "CASE-0004", "customer_id": "C5", "origin_address": "Prawet, Bangkok, Thailand", "volume_cbm": 120.0, "duration_days": 30, "sla": {"latest_dropoff_hour": 18, "weekday_only": true}}''')
,
json.loads(r'''{"accept": null, "chosen_warehouse": null, "min_candidates": 1}''')
))
CASES.append((
json.loads(r'''{"offer_id": "CASE-0005", "customer_id": "C6", "origin_address": "Minburi, Bangkok, Thailand", "volume_cbm": 120.0, "duration_days": 30, "sla": {"latest_dropoff_hour": 18, "weekday_only": true}}''')
,
json.loads(r'''{"accept": null, "chosen_warehouse": null, "min_candidates": 1}''')
))
CASES.append((
json.loads(r'''{"offer_id": "CASE-0006", "customer_id": "C7", "origin_address": "Lat Phrao, Bangkok, Thailand", "volume_cbm": 120.0, "duration_days": 30, "sla": {"latest_dropoff_hour": 18, "weekday_only": true}}''')
,
json.loads(r'''{"accept": null, "chosen_warehouse": null, "min_candidates": 1}''')
))
CASES.append((
json.loads(r'''{"offer_id": "CASE-0007", "customer_id": "C8", "origin_address": ", Samut Prakan, Thailand", "volume_cbm": 120.0, "duration_days": 30, "sla": {"latest_dropoff_hour": 18, "weekday_only": true}}''')
,
json.loads(r'''{"accept": null, "chosen_warehouse": null, "min_candidates": 1}''')
))
CASES.append((
json.loads(r'''{"offer_id": "CASE-0009", "customer_id": "C9", "origin_address": ", Din Daeng, Bangkok, Thailand", "volume_cbm": 120.0, "duration_days": 30, "sla": {"latest_dropoff_hour": 18, "weekday_only": true}}''')
,
json.loads(r'''{"accept": null, "chosen_warehouse": null, "min_candidates": 1}''')
))
CASES.append((
json.loads(r'''{"offer_id": "CASE-0010", "customer_id": "C10", "origin_address": ", Phaya Thai, Bangkok, Thailand", "volume_cbm": 120.0, "duration_days": 30, "sla": {"latest_dropoff_hour": 18, "weekday_only": true}}''')
,
json.loads(r'''{"accept": null, "chosen_warehouse": null, "min_candidates": 1}''')
))
def _check_expected(res, expected):
    if expected.get('accept') is not None:
        assert bool(res.get('accept')) == bool(expected['accept'])
    if expected.get('chosen_warehouse') is not None:
        assert res.get('chosen_warehouse') == expected['chosen_warehouse']
    min_c = int(expected.get('min_candidates', 0))
    assert len(res.get('candidates', [])) >= min_c

def test_external_cases_param():
    assert len(CASES) > 0, 'No cases imported'
    for i, (offer, expected) in enumerate(CASES):
        res = run(offer)
        assert isinstance(res, dict)
        _check_expected(res, expected)